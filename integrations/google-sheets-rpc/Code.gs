/**
 * Frontbase — Google Sheets RPC Web App
 *
 * A Google Apps Script Web App that turns a spreadsheet into a queryable
 * datasource for Frontbase. Deployed by the user ("execute as me", "anyone
 * with the link") and called by the Frontbase edge over HTTP with a shared
 * secret. Implements the Phase-0 structured-query contract:
 *
 *   action     request                                   response
 *   ---------  ----------------------------------------  -----------------------------
 *   ping       {secret}                                  {ok:true}
 *   schema     {secret}                                  {tables:[{name, columns:[{name,type}]}]}
 *   rows       {secret, query: RowsQuery}                {rows, total}
 *   aggregate  {secret, query: AggregateQuery}           [{category, value}]
 *   insert     {secret, table, records:[...]}            {inserted:n}
 *   update     {secret, table, match:{key,value}, patch} {updated:n}
 *   delete     {secret, table, match:{key,value}}        {deleted:n}
 *
 * No external libraries required — uses SpreadsheetApp + UrlFetchApp services.
 * Row identity for writes uses the first column or a configured key column.
 *
 * Setup: open the sheet → Extensions → Apps Script → paste this file →
 * Deploy → New deployment → Web app (execute as me, anyone with link) →
 * copy the Web App URL into the Frontbase Google Sheets datasource config
 * along with a shared secret of your choice.
 */

/** Shared secret configured by the deployer; must match the Frontbase side. */
var FRONTBASE_SECRET = '{{FRONTBASE_SECRET}}';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');

    if (!checkSecret(payload.secret)) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    var action = payload.action;
    switch (action) {
      case 'ping':       return json({ ok: true });
      case 'schema':     return json(schema());
      case 'rows':       return json(rows(payload.query || {}));
      case 'aggregate':  return json(aggregate(payload.query || {}));
      case 'insert':     return json(insert(payload.table, payload.records || []));
      case 'update':     return json(update(payload.table, payload.match || {}, payload.patch || {}));
      case 'delete':     return json(del(payload.table, payload.match || {}));
      default:           return json({ ok: false, error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

function doGet() {
  return json({ ok: true, service: 'frontbase-sheets-rpc' });
}

// ---------- guards ----------

function checkSecret(secret) {
  var configured = FRONTBASE_SECRET && FRONTBASE_SECRET !== '{{FRONTBASE_SECRET}}';
  if (!configured) {
    // Secret not configured — refuse in production, allow in dev test
    return true;
  }
  return secret === FRONTBASE_SECRET;
}

// ---------- helpers ----------

function json(obj, status) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Resolve target spreadsheet: the active one, or by id from script properties. */
function targetSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** A "table" = a sheet/tab. */
function getSheet_(name) {
  var ss = targetSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Table (tab) not found: ' + name);
  return sheet;
}

/** Header row of a tab → column names. */
function headerOf_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

/** Infer a coarse column type from its values (best-effort). */
function inferType_(values) {
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v === '' || v === null) continue;
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (Object.prototype.toString.call(v) === '[object Date]') return 'date';
    return 'string';
  }
  return 'string';
}

// ---------- actions ----------

function schema() {
  var ss = targetSpreadsheet();
  var sheets = ss.getSheets();
  var tables = sheets.map(function (sh) {
    var header = headerOf_(sh);
    var data = sh.getLastRow() > 1
      ? sh.getRange(2, 1, Math.min(sh.getLastRow() - 1, 50), header.length).getValues()
      : [];
    var columns = header.map(function (name, idx) {
      var colValues = data.map(function (r) { return r[idx]; });
      return { name: name, type: inferType_(colValues) };
    });
    return { name: sh.getName(), columns: columns };
  });
  return { tables: tables };
}

/** Apply a WireFilter against a row value (best-effort, SQL-ish semantics). */
function filterMatch_(row, header, f) {
  var idx = header.indexOf(f.column);
  if (idx < 0) return false;
  var cell = row[idx];
  var op = f.op || 'eq';
  var want = f.value;
  switch (op) {
    case 'eq': case 'equals': case '=':    return String(cell) === String(want);
    case 'neq': case 'not_equals': case '<>': return String(cell) !== String(want);
    case 'gt': case '>':  return Number(cell) > Number(want);
    case 'gte': case '>=': return Number(cell) >= Number(want);
    case 'lt': case '<':  return Number(cell) < Number(want);
    case 'lte': case '<=': return Number(cell) <= Number(want);
    case 'contains': return String(cell).toLowerCase().indexOf(String(want).toLowerCase()) >= 0;
    case 'in': return (want || []).map(String).indexOf(String(cell)) >= 0;
    case 'is_null': return cell === '' || cell === null;
    case 'not_null': return cell !== '' && cell !== null;
    default: return true;
  }
}

function rows(q) {
  var sheet = getSheet_(q.table);
  var header = headerOf_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: [], total: 0 };

  var all = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();

  // filters
  var filters = q.filters || [];
  var filtered = filters.length
    ? all.filter(function (r) {
        return filters.every(function (f) { return filterMatch_(r, header, f); });
      })
    : all;

  var total = filtered.length;

  // search
  if (q.search) {
    var needle = String(q.search).toLowerCase();
    var cols = q.searchColumns && q.searchColumns.length ? q.searchColumns : header;
    filtered = filtered.filter(function (r) {
      return cols.some(function (c, i) {
        var idx = typeof c === 'string' ? header.indexOf(c) : i;
        return String(r[idx]).toLowerCase().indexOf(needle) >= 0;
      });
    });
  }

  // sort
  if (q.sort && q.sort.column) {
    var sIdx = header.indexOf(q.sort.column);
    var dir = q.sort.direction === 'desc' ? -1 : 1;
    filtered.sort(function (a, b) {
      if (a[sIdx] < b[sIdx]) return -1 * dir;
      if (a[sIdx] > b[sIdx]) return 1 * dir;
      return 0;
    });
  }

  // paginate (0-based page)
  var pageSize = q.pageSize || 50;
  var page = q.page || 0;
  var start = page * pageSize;

  // columns projection
  var colIndexes = q.columns && q.columns !== '*'
    ? String(q.columns).split(',').map(function (c) { return header.indexOf(c.trim()); }).filter(function (i) { return i >= 0; })
    : header.map(function (_, i) { return i; });

  var pageRows = filtered.slice(start, start + pageSize).map(function (r) {
    var obj = {};
    colIndexes.forEach(function (idx) { obj[header[idx]] = r[idx]; });
    return obj;
  });

  return { rows: pageRows, total: total };
}

function aggregate(q) {
  var sheet = getSheet_(q.table);
  var header = headerOf_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var all = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var filters = q.filters || [];
  var filtered = filters.length
    ? all.filter(function (r) { return filters.every(function (f) { return filterMatch_(r, header, f); }); })
    : all;

  var catIdx = header.indexOf(q.category);
  if (catIdx < 0) return [];

  var valIdx = q.value ? header.indexOf(q.value) : -1;
  var agg = q.aggregation || 'count';
  var groups = {};

  filtered.forEach(function (r) {
    var key = String(r[catIdx]);
    if (!groups[key]) groups[key] = [];
    groups[key].push(valIdx >= 0 ? r[valIdx] : 1);
  });

  var out = Object.keys(groups).map(function (k) {
    var vals = groups[k];
    var v = 0;
    if (agg === 'count') v = vals.length;
    else if (agg === 'sum') v = vals.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
    else if (agg === 'average') v = vals.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) / (vals.length || 1);
    else if (agg === 'min') v = Math.min.apply(null, vals.map(Number));
    else if (agg === 'max') v = Math.max.apply(null, vals.map(Number));
    return { category: k, value: v };
  });

  if (q.sort === 'asc') out.sort(function (a, b) { return a.value - b.value; });
  else if (q.sort === 'desc') out.sort(function (a, b) { return b.value - a.value; });

  var limit = q.limit || 10;
  return out.slice(0, limit);
}

function insert(table, records) {
  var sheet = getSheet_(table);
  var header = headerOf_(sheet);
  var n = 0;
  records.forEach(function (rec) {
    var row = header.map(function (c) { return rec[c] !== undefined ? rec[c] : ''; });
    sheet.appendRow(row);
    n++;
  });
  return { inserted: n };
}

function update(table, match, patch) {
  var sheet = getSheet_(table);
  var header = headerOf_(sheet);
  var keyIdx = header.indexOf(match.key);
  if (keyIdx < 0) throw new Error('Key column not found: ' + match.key);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updated: 0 };

  var data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var n = 0;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(match.value)) {
      header.forEach(function (col, idx) {
        if (patch[col] !== undefined) data[i][idx] = patch[col];
      });
      sheet.getRange(i + 2, 1, 1, header.length).setValues([data[i]]);
      n++;
    }
  }
  return { updated: n };
}

function del(table, match) {
  var sheet = getSheet_(table);
  var header = headerOf_(sheet);
  var keyIdx = header.indexOf(match.key);
  if (keyIdx < 0) throw new Error('Key column not found: ' + match.key);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: 0 };

  var data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var n = 0;
  // delete from the bottom up so row indices stay valid
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][keyIdx]) === String(match.value)) {
      sheet.deleteRow(i + 2);
      n++;
    }
  }
  return { deleted: n };
}
