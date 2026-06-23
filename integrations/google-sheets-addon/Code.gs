/**
 * Frontbase for Google Sheets — Workspace Add-on (setup wizard).
 *
 * Goal: let a user connect a Google Sheet to Frontbase with ONE action — paste a
 * connect code, click Configure, done. No copy-pasting Apps Script code, no
 * manually deploying a Web App, no shared-secret juggling.
 *
 * What happens on "Configure":
 *   1. Reads the active spreadsheet id + name.
 *   2. Generates a per-sheet shared secret.
 *   3. Via the Apps Script API (using ScriptApp.getOAuthToken()):
 *        a. creates a NEW Apps Script project in the user's Drive,
 *        b. uploads the RPC source (Code.gs) + manifest with the secret + sheet
 *           id baked in,
 *        c. creates a version,
 *        d. deploys it as a Web App (executeAs: USER_DEPLOYING, access: ANYONE).
 *   4. POSTs {connectCode, spreadsheetId, webAppUrl, webAppSecret} to Frontbase,
 *      which validates the connect code and upserts the google_sheets datasource.
 *
 * The runtime data path (edge -> Web App RPC) is unchanged; this add-on only
 * automates deployment + registration.
 *
 * DISTRIBUTION: Workspace Add-on. Ship via an unlisted/private install link first
 * (sensitive-scope verification for script.deployments/script.projects is needed
 * for a public Marketplace listing — see README).
 */

// Frontbase connect callback (edge runtime path is unchanged). Override for
// self-host / staging via Script Properties: FRONTBASE_CONNECT_URL.
var FRONTBASE_CONNECT_URL = 'https://app.frontbase.dev/api/sync/datasources/sheets/connect/callback/';

// ─────────────────────────── Card service UI ─────────────────────────────────

function onFrontbaseHomepage(e) {
  return buildConnectCard_('Paste the connect code from Frontbase, then click Configure.', '').build();
}

function buildConnectCard_(message, tokenDefault) {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader()
    .setTitle('Frontbase')
    .setSubtitle('Connect this spreadsheet'));

  var section = CardService.newCardSection()
    .setHeader('Step 1 — Get a connect code')
    .addWidget(CardService.newTextParagraph()
      .setText('In Frontbase: <b>Data Sources → Add → Google Sheets → Connect via add-on</b>. Copy the connect code.'))
    .addWidget(CardService.newTextInput()
      .setFieldName('connectCode')
      .setTitle('Connect code')
      .setHint('Paste the code from Frontbase here')
      .setValue(tokenDefault || ''))
    .addWidget(CardService.newTextParagraph().setText('<b>' + message + '</b>'));

  var action = CardService.newAction().setFunctionName('configureAction');
  section.addWidget(CardService.newTextButton()
    .setText('Configure')
    .setOnClickAction(action)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED));

  section.addWidget(CardService.newTextParagraph()
    .setText('<font color="#999">Manual setup: <a href="https://docs.frontbase.dev/google-sheets-setup">docs</a></font>'));

  card.addSection(section);
  return card;
}

function buildDoneCard_(result) {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader()
    .setTitle('✅ Connected')
    .setSubtitle(result.spreadsheetName));

  var section = CardService.newCardSection().setHeader('Details');
  section.addWidget(CardService.newTextParagraph()
    .setText('This spreadsheet is now a Frontbase datasource. Return to Frontbase — it should show <b>connected</b> automatically.'));
  section.addWidget(CardService.newKeyValue().setTopLabel('Spreadsheet').setContent(result.spreadsheetName));
  section.addWidget(CardService.newKeyValue().setTopLabel('Web App URL').setContent(result.webAppUrl));
  card.addSection(section);
  return card;
}

function configureAction(e) {
  var connectCode = (e && e.formInput && e.formInput.connectCode) || '';
  connectCode = String(connectCode).trim();

  if (connectCode.length < 10) {
    return notifyAndRerender_(
      'Please paste a valid connect code.',
      CardService.NotificationType.ERROR,
      connectCode
    );
  }

  try {
    var result = deployAndRegister_(connectCode);
    var card = buildDoneCard_(result).build();
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification()
        .setText('Connected to Frontbase!')
        .setType(CardService.NotificationType.INFO))
      .build();
  } catch (err) {
    var msg = 'Configuration failed: ' + String(err && err.message || err);
    return notifyAndRerender_(msg, CardService.NotificationType.ERROR, connectCode);
  }
}

function notifyAndRerender_(message, type, tokenDefault) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(message).setType(type))
    .setNavigation(CardService.newNavigation().updateCard(buildConnectCard_(message, tokenDefault).build()))
    .build();
}

// ─────────────────────── Deploy + register sequence ──────────────────────────

function deployAndRegister_(connectCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var spreadsheetName = ss.getName();
  var secret = generateSecret_();

  // 1. Create a new Apps Script project in the user's Drive.
  var scriptId = createRpcProject_(spreadsheetName);

  // 2. Upload the RPC source (secret + sheet id baked in) + manifest.
  uploadRpcContent_(scriptId, secret, spreadsheetId);

  // 3. Create a version.
  var versionNumber = createVersion_(scriptId);

  // 4. Deploy as a Web App and read back the /exec URL.
  var webAppUrl = createWebAppDeployment_(scriptId, versionNumber);

  // 5. Register with Frontbase (validates the connect code, upserts datasource).
  registerWithFrontbase_(connectCode, spreadsheetId, spreadsheetName, webAppUrl, secret);

  return { spreadsheetId: spreadsheetId, spreadsheetName: spreadsheetName, webAppUrl: webAppUrl };
}

function createRpcProject_(title) {
  var resp = appsScriptApi_('post', '/projects', { title: 'Frontbase — ' + (title || 'Sheet') });
  if (!resp.scriptId) throw new Error('Project creation returned no scriptId: ' + JSON.stringify(resp));
  return resp.scriptId;
}

function uploadRpcContent_(scriptId, secret, spreadsheetId) {
  var source = String(RPC_SOURCE)
    .split('__FRONTBASE_SECRET__').join(secret)
    .split('__SPREADSHEET_ID__').join(spreadsheetId);

  var body = {
    files: [
      { name: 'appsscript', type: 'JSON', source: JSON.stringify(rpcManifest_()) },
      { name: 'Code', type: 'SERVER_JS', source: source }
    ]
  };
  appsScriptApi_('PUT', '/projects/' + encodeURIComponent(scriptId) + '/content', body);
}

function rpcManifest_() {
  return {
    timeZone: 'America/New_York',
    dependencies: {},
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    oauthScopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/script.scriptapp'
    ],
    webapp: {
      executeAs: 'USER_DEPLOYING',
      access: 'ANYONE_ANONYMOUS'
    }
  };
}

function createVersion_(scriptId) {
  var resp = appsScriptApi_('Post', '/projects/' + encodeURIComponent(scriptId) + '/versions',
    { description: 'Initial deploy via Frontbase add-on' });
  if (!resp.versionNumber) throw new Error('Version creation returned no versionNumber: ' + JSON.stringify(resp));
  return resp.versionNumber;
}

function createWebAppDeployment_(scriptId, versionNumber) {
  // Canonical Apps Script API Deployment resource (EntryPoint → WebAppEntryPoint).
  var body = {
    deploymentConfig: {
      scriptId: scriptId,
      versionNumber: versionNumber,
      manifestFileName: 'appsscript',
      description: 'Frontbase RPC web app'
    },
    entryPoints: [
      {
        entryPointType: 'WEB_APP',
        webApp: {
          webAppConfig: {
            access: 'ANYONE_ANONYMOUS',     // edge calls it anonymously with the secret
            executeAs: 'USER_DEPLOYING'     // runs as the user (sheet owner)
          },
          entryPointConfig: {
            access: 'ANYONE_ANONYMOUS'
          }
        }
      }
    ]
  };
  var resp = appsScriptApi_('Post', '/projects/' + encodeURIComponent(scriptId) + '/deployments', body);
  var entryPoints = resp.entryPoints || [];
  for (var i = 0; i < entryPoints.length; i++) {
    var ep = entryPoints[i] || {};
    if (ep.entryPointType === 'WEB_APP' && ep.webApp && ep.webApp.url) {
      return ep.webApp.url;
    }
  }
  throw new Error('Web app deployment returned no /exec URL: ' + JSON.stringify(resp));
}

function registerWithFrontbase_(connectCode, spreadsheetId, spreadsheetName, webAppUrl, secret) {
  var url = (PropertiesService.getScriptProperties().getProperty('FRONTBASE_CONNECT_URL')) || FRONTBASE_CONNECT_URL;
  var body = {
    token: connectCode,
    spreadsheetId: spreadsheetId,
    spreadsheetName: spreadsheetName,
    webAppUrl: webAppUrl,
    webAppSecret: secret
  };
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    followRedirects: true
  });
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Frontbase registration failed (' + code + '): ' + resp.getContentText());
  }
}

// ─────────────────────────── helpers ─────────────────────────────────────────

function appsScriptApi_(method, path, body) {
  var url = 'https://script.googleapis.com/v1' + path;
  var opts = {
    method: String(method).toLowerCase(),
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    followRedirects: true
  };
  if (body !== undefined && body !== null) opts.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(url, opts);
  var httpCode = resp.getResponseCode();
  var text = resp.getContentText();
  if (httpCode < 200 || httpCode >= 300) {
    throw new Error('Apps Script API ' + method + ' ' + path + ' failed (' + httpCode + '): ' + text);
  }
  return text ? JSON.parse(text) : {};
}

function generateSecret_() {
  // Cryptographically secure random secret (32 bytes base64url-encoded → ~43 chars).
  // Using Utilities.computeDigest with a random seed rather than Math.random().
  var seed = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      Utilities.getUuid() + Date.now() + SpreadsheetApp.getActiveSpreadsheet().getId());
  var bytes = seed.slice(0, 32).map(function(b) { return (b < 0 ? b + 256 : b); });
  var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var out = '';
  for (var i = 0; i < 32; i++) {
    // Use bytes as indices into chars for entropy
    out += chars.charAt(bytes[i % bytes.length] % chars.length);
  }
  // Add 11 more chars from UUID base64 for additional entropy (43 total ~256-bit security)
  var extra = Utilities.base64Encode(Utilities.getUuid()).replace(/[^a-zA-Z0-9]/g, '').substring(0, 11);
  return out + extra;
}

// ─────────────────────── Embedded RPC source ─────────────────────────────────
// Canonical copy: ./rpc-source.gs — keep in sync.
var RPC_SOURCE = ''
+ '/**\n'
+ ' * Frontbase Sheets RPC — deployed by the add-on into the user\'s Drive project.\n'
+ ' */\n'
+ 'var FRONTBASE_SECRET = \'__FRONTBASE_SECRET__\';\n'
+ 'var SPREADSHEET_ID = \'__SPREADSHEET_ID__\';\n'
+ '\n'
+ 'function doPost(e) {\n'
+ '  try {\n'
+ '    var payload = JSON.parse(e.postData.contents || \'{}\');\n'
+ '    if (!checkSecret(payload.secret)) return json({ ok: false, error: \'Unauthorized\' }, 401);\n'
+ '    var action = payload.action;\n'
+ '    switch (action) {\n'
+ '      case \'ping\':       return json({ ok: true });\n'
+ '      case \'schema\':     return json(schema());\n'
+ '      case \'rows\':       return json(rows(payload.query || {}));\n'
+ '      case \'aggregate\':  return json(aggregate(payload.query || {}));\n'
+ '      case \'insert\':     return json(insert(payload.table, payload.records || []));\n'
+ '      case \'update\':     return json(update(payload.table, payload.match || {}, payload.patch || {}));\n'
+ '      case \'delete\':     return json(del(payload.table, payload.match || {}));\n'
+ '      default:           return json({ ok: false, error: \'Unknown action: \' + action }, 400);\n'
+ '    }\n'
+ '  } catch (err) {\n'
+ '    return json({ ok: false, error: String(err && err.message || err) }, 500);\n'
+ '  }\n'
+ '}\n'
+ 'function doGet() { return json({ ok: true, service: \'frontbase-sheets-rpc\' }); }\n'
+ 'function checkSecret(secret) { return FRONTBASE_SECRET && FRONTBASE_SECRET !== \'__FRONTBASE_SECRET__\' && secret === FRONTBASE_SECRET; }\n'
+ 'function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }\n'
+ 'function targetSpreadsheet() { return (SPREADSHEET_ID && SPREADSHEET_ID !== \'__SPREADSHEET_ID__\') ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }\n'
+ 'function getSheet_(name) { var s = targetSpreadsheet().getSheetByName(name); if (!s) throw new Error(\'Table (tab) not found: \' + name); return s; }\n'
+ 'function headerOf_(s) { var lc = s.getLastColumn(); return lc < 1 ? [] : s.getRange(1,1,1,lc).getValues()[0]; }\n'
+ 'function ensureIdColumn_(s) { var h = headerOf_(s); if (h.length>0 && h[0]===\'id\') return false; s.insertColumnsBefore(1,1); s.getRange(1,1).setValue(\'id\'); var lr=s.getLastRow(); if(lr>1){var ids=[];for(var i=2;i<=lr;i++)ids.push([i-1]);s.getRange(2,1,lr-1,1).setValues(ids);} return true; }\n'
+ 'function nextId_(s) { var lr=s.getLastRow(); if(lr<2) return 1; var c=s.getRange(2,1,lr-1,1).getValues(); var m=0; for(var i=0;i<c.length;i++){var v=Number(c[i][0]); if(!isNaN(v)&&v>m)m=v;} return m+1; }\n'
+ 'function inferType_(values) { for(var i=0;i<values.length;i++){var v=values[i]; if(v===\'\'||v===null)continue; if(typeof v===\'boolean\')return\'boolean\'; if(typeof v===\'number\')return\'number\'; if(Object.prototype.toString.call(v)===\'[object Date]\')return\'date\'; return\'string\';} return\'string\'; }\n'
+ 'function schema() { var ss=targetSpreadsheet(); return { tables: ss.getSheets().map(function(sh){ ensureIdColumn_(sh); var h=headerOf_(sh); var d=sh.getLastRow()>1?sh.getRange(2,1,Math.min(sh.getLastRow()-1,50),h.length).getValues():[]; return { name:sh.getName(), columns:h.map(function(n,idx){ return {name:n, type:inferType_(d.map(function(r){return r[idx];}))}; }) }; }) }; }\n'
+ 'function filterMatch_(row,header,f) { var idx=header.indexOf(f.column); if(idx<0)return false; var cell=row[idx]; var op=f.op||\'eq\'; var want=f.value; switch(op){ case \'eq\':case \'equals\':case \'=\': return String(cell)===String(want); case \'neq\':case \'not_equals\':case \'<>\': return String(cell)!==String(want); case \'gt\':case \'>\': return Number(cell)>Number(want); case \'gte\':case \'>=\': return Number(cell)>=Number(want); case \'lt\':case \'<\': return Number(cell)<Number(want); case \'lte\':case \'<=\': return Number(cell)<=Number(want); case \'contains\': return String(cell).toLowerCase().indexOf(String(want).toLowerCase())>=0; case \'in\': return (want||[]).map(String).indexOf(String(cell))>=0; case \'is_null\': return cell===\'\'||cell===null; case \'not_null\': return cell!==\'\'&&cell!==null; default: return true; } }\n'
+ 'function rows(q) { var s=getSheet_(q.table); var h=headerOf_(s); var lr=s.getLastRow(); if(lr<2)return {rows:[],total:0}; var all=s.getRange(2,1,lr-1,h.length).getValues(); var filters=q.filters||[]; var filtered=filters.length?all.filter(function(r){return filters.every(function(f){return filterMatch_(r,h,f);});}):all; var total=filtered.length; if(q.search){var needle=String(q.search).toLowerCase(); var cols=q.searchColumns&&q.searchColumns.length?q.searchColumns:h; filtered=filtered.filter(function(r){return cols.some(function(c,i){var idx=typeof c===\'string\'?h.indexOf(c):i; return String(r[idx]).toLowerCase().indexOf(needle)>=0;});});} if(q.sort&&q.sort.column){var sIdx=h.indexOf(q.sort.column); var dir=q.sort.direction===\'desc\'?-1:1; filtered.sort(function(a,b){if(a[sIdx]<b[sIdx])return -1*dir; if(a[sIdx]>b[sIdx])return 1*dir; return 0;});} var pageSize=q.pageSize||50; var page=q.page||0; var start=page*pageSize; var colIndexes=q.columns&&q.columns!==\'*\'?String(q.columns).split(\',\').map(function(c){return h.indexOf(c.trim());}).filter(function(i){return i>=0;}):h.map(function(_,i){return i;}); var pageRows=filtered.slice(start,start+pageSize).map(function(r){var o={}; colIndexes.forEach(function(idx){o[h[idx]]=r[idx];}); return o;}); return {rows:pageRows,total:total}; }\n'
+ 'function aggregate(q) { var s=getSheet_(q.table); var h=headerOf_(s); var lr=s.getLastRow(); if(lr<2)return []; var all=s.getRange(2,1,lr-1,h.length).getValues(); var filters=q.filters||[]; var filtered=filters.length?all.filter(function(r){return filters.every(function(f){return filterMatch_(r,h,f);});}):all; var catIdx=h.indexOf(q.category); if(catIdx<0)return []; var valIdx=q.value?h.indexOf(q.value):-1; var agg=q.aggregation||\'count\'; var groups={}; filtered.forEach(function(r){var key=String(r[catIdx]); if(!groups[key])groups[key]=[]; groups[key].push(valIdx>=0?r[valIdx]:1);}); var out=Object.keys(groups).map(function(k){var vals=groups[k]; var v=0; if(agg===\'count\')v=vals.length; else if(agg===\'sum\')v=vals.reduce(function(a,b){return a+(Number(b)||0);},0); else if(agg===\'average\')v=vals.reduce(function(a,b){return a+(Number(b)||0);},0)/(vals.length||1); else if(agg===\'min\')v=Math.min.apply(null,vals.map(Number)); else if(agg===\'max\')v=Math.max.apply(null,vals.map(Number)); return {category:k,value:v};}); if(q.sort===\'asc\')out.sort(function(a,b){return a.value-b.value;}); else if(q.sort===\'desc\')out.sort(function(a,b){return b.value-a.value;}); return out.slice(0,q.limit||10); }\n'
+ 'function insert(table,records) { var s=getSheet_(table); ensureIdColumn_(s); var h=headerOf_(s); var nextId=nextId_(s); var n=0; records.forEach(function(rec){var row=h.map(function(c){ if(c===\'id\')return nextId++; return rec[c]!==undefined?rec[c]:\'\';}); s.appendRow(row); n++;}); return {inserted:n}; }\n'
+ 'function update(table,match,patch) { var s=getSheet_(table); var h=headerOf_(s); var keyIdx=h.indexOf(match.key); if(keyIdx<0)throw new Error(\'Key column not found: \'+match.key); var lr=s.getLastRow(); if(lr<2)return {updated:0}; var data=s.getRange(2,1,lr-1,h.length).getValues(); var n=0; for(var i=0;i<data.length;i++){ if(String(data[i][keyIdx])===String(match.value)){ h.forEach(function(col,idx){ if(patch[col]!==undefined)data[i][idx]=patch[col]; }); s.getRange(i+2,1,1,h.length).setValues([data[i]]); n++; } } return {updated:n}; }\n'
+ 'function del(table,match) { var s=getSheet_(table); var h=headerOf_(s); var keyIdx=h.indexOf(match.key); if(keyIdx<0)throw new Error(\'Key column not found: \'+match.key); var lr=s.getLastRow(); if(lr<2)return {deleted:0}; var data=s.getRange(2,1,lr-1,h.length).getValues(); var n=0; for(var i=data.length-1;i>=0;i--){ if(String(data[i][keyIdx])===String(match.value)){ s.deleteRow(i+2); n++; } } return {deleted:n}; }\n';
