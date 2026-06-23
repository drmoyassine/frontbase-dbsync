# Frontbase for Google Sheets — Workspace Add-on

A Google Workspace Add-on that connects a Google Sheet to Frontbase with a single
action: **paste a connect code → click Configure → done.** It deploys the
Frontbase RPC Apps Script Web App into the user's own Drive (behind the scenes),
generates a shared secret, and registers the sheet with Frontbase. The runtime
data path (edge → Web App RPC) is unchanged from the manual setup.

## Files

| File | Purpose |
|------|---------|
| `appsscript.json` | Add-on manifest: Sheets add-on triggers, OAuth scopes, `urlFetchWhitelist`. |
| `Code.gs` | The add-on: Card-service wizard + Apps Script API deploy sequence. Embeds the RPC source as `RPC_SOURCE`. |
| `rpc-source.gs` | Canonical, readable copy of the RPC uploaded into each user's project. **Keep in sync with `RPC_SOURCE` in `Code.gs`.** |

## What "Configure" does

1. Reads the active spreadsheet id + name.
2. Generates a 32-char shared secret.
3. Calls the **Apps Script API** (`ScriptApp.getOAuthToken()`) to:
   - `projects.create` — new standalone project in the user's Drive,
   - `projects.updateContent` — upload RPC source (secret + sheet id baked in) + manifest,
   - `projects.versions.create` — version 1,
   - `projects.deployments.create` — Web App, `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.
4. POSTs `{token, spreadsheetId, webAppUrl, webAppSecret}` to Frontbase's
   `/api/sync/datasources/sheets/connect/callback`, which validates the connect
   code (single-use, Redis) and upserts the `google_sheets` datasource.

## Required OAuth scopes (declared in `appsscript.json`)

- `script.projects`, `script.deployments` — to create + deploy the per-user Web App.
- `script.external_request` — for `UrlFetchApp` (Apps Script API + Frontbase callback).
- `spreadsheets.currentonly` — read the active sheet's id/name.
- `script.scriptapp` — `ScriptApp.getOAuthToken()`.
- `drive.file` — creating the script project file in Drive.

> ⚠️ `script.deployments` / `script.projects` are **sensitive scopes**. Google
> grants them inconsistently for *public* Workspace Marketplace add-ons. **Ship
> via an unlisted/private install link first**; pursue public Marketplace
> listing (with scope verification) separately.

## Self-host / staging override

Set a Script Property `FRONTBASE_CONNECT_URL` to point the add-on at a non-production
Frontbase callback (otherwise it defaults to `https://app.frontbase.dev/...`).

> 🔐 **Security note**: This override exists for self-hosted deployments and testing.
> Only project owners/editors can modify Script Properties. In production, the
> add-on should use the default Frontbase callback URL. If a malicious actor with
> edit access overrides this, they could redirect callbacks to capture secrets/tokens.

## Deploying the add-on (maintainer)

Using [clasp](https://github.com/google/clasp):

```bash
npm i -g @google/clasp
clasp login                          # account that will own the add-on
clasp create --type standalone --title "Frontbase for Google Sheets" --root .
# copy appsscript.json + Code.gs into the created project (clasp pull/push)
clasp push                           # upload the files
# Create a GCP "Standard" project, link it to this script (Project Settings → GCP),
# then in GCP: configure the OAuth consent screen with the sensitive scopes above.
```

Then create an **unlisted** deployment for distribution, or submit to the
Workspace Marketplace for a public listing (requires sensitive-scope verification).

## Manual fallback (semi-guided)

If programmatic deployment is blocked, the add-on can fall back to: generate
secret + show the Web App `/exec` URL field for the user to paste after a guided
"Deploy as Web App". This reduces today's 5 copy-pastes to 1. (Not yet wired —
see plan Phase 1-Fallback.)

## Manual path (legacy, unchanged)

Users can still connect manually via `integrations/google-sheets-rpc/Code.gs` +
`docs/google-sheets-setup.md`. The add-on supersedes this for new connections.
