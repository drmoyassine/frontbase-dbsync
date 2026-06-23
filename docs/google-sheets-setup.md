# Google Sheets Datasource Setup Guide

This guide walks you through connecting a Google Sheet as a datasource in Frontbase.

## Overview

Frontbase connects to Google Sheets via an **Apps Script Web App** that reads and
writes your spreadsheet. This enables:

- Querying rows with filters, sorting, and pagination
- Aggregations (count, sum, average, min, max)
- Insert, update, and delete operations

There are **two ways** to set this up — both produce the exact same result:

| | **Approach A — Google Sheets Add-on** (recommended) | **Approach B — Manual Apps Script** |
|---|---|---|
| **Steps** | Paste a one-time code, click Configure | Copy code, deploy Web App, copy URL + secret |
| **Copy-paste** | None | Several values back and forth |
| **Secret handling** | Auto-generated & encrypted | You generate, match, and redeploy |
| **Best for** | Everyone, once the add-on is installed | Edge cases / air-gapped / add-on unavailable |

Under the hood both approaches deploy the same Apps Script RPC. Approach A just
automates the deployment and registration.

## Prerequisites

- A Google Sheet with your data
- **Approach A:** the Frontbase add-on installed in your Google account (see below)
- **Approach B:** access to Google Apps Script (free with any Google Account)

## Prepare Your Spreadsheet

Applies to both approaches.

1. Open your Google Sheet
2. Ensure the first row contains **column headers** (these become the field names)
3. Each subsequent row is a record

**Example:**
```
| id    | name        | email               | status  |
|-------|-------------|---------------------|---------|
| 1     | John Doe    | john@example.com    | active  |
| 2     | Jane Smith  | jane@example.com    | active  |
```

---

# Approach A — Google Sheets Add-on (recommended)

The add-on deploys the Apps Script Web App into your own Google Drive **behind the
scenes** and registers it with Frontbase automatically. No copying code, URLs, or
secrets.

## A.1 Install the add-on

Install the **"Frontbase for Google Sheets"** Workspace add-on from the link shown
in Frontbase (or your admin's install link). The add-on appears under
**Extensions → Frontbase** in any spreadsheet.

> The add-on is distributed as a Workspace Add-on. In Frontbase, the install link
> is shown in the connect dialog (if your deployment has set
> `FRONTBASE_SHEETS_ADDON_URL`). Until then, get the link from whoever manages
> your Frontbase instance.

## A.2 Get a connect code from Frontbase

1. In Frontbase Builder, go to **Data Sources → Add Data Source**
2. From **Database Type**, select **Google Sheets**
3. Under **"Connect with the add-on (recommended)"**, click **Get connect code**
4. A one-time code is displayed (valid for ~15 minutes). Keep this dialog open.

## A.3 Connect from the add-on

1. In your Google Sheet, open **Extensions → Frontbase → Connect**
2. Paste the **connect code** from Frontbase
3. Click **Configure**

The add-on will:
- Create a dedicated Apps Script project in your Drive
- Deploy it as a Web App (running as you, reading your sheet)
- Generate a per-sheet secret
- Register the connection with Frontbase

## A.4 Done

Frontbase detects the connection automatically (the dialog closes on its own) and
discovers your sheet's tables. You can skip straight to
[Your Spreadsheet Schema](#your-spreadsheet-schema).

**Reconnecting / refreshing:** repeat A.2–A.3 with a fresh code anytime. The add-on
updates your existing datasource in place (matched by spreadsheet).

---

# Approach B — Manual Apps Script setup

Use this if the add-on isn't available, or you prefer full manual control. You will
copy the RPC code into Apps Script, deploy a Web App, and enter three values in
Frontbase.

## B.1 Open Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. A new tab opens with the Apps Script editor

## B.2 Paste the Code

Copy the code from `integrations/google-sheets-rpc/Code.gs` in the Frontbase
repository and paste it into the editor, replacing the default contents.

**Quick copy** (the essential parts):
```javascript
var FRONTBASE_SECRET = 'YOUR_SECRET_HERE'; // You'll set this in Step B.3

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    if (payload.secret !== FRONTBASE_SECRET) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }
    var action = payload.action;
    switch (action) {
      case 'ping': return json({ ok: true });
      case 'schema': return json(schema());
      case 'rows': return json(rows(payload.query || {}));
      case 'insert': return json(insert(payload.table, payload.records || []));
      case 'update': return json(update(payload.table, payload.match || {}, payload.patch || {}));
      case 'delete': return json(del(payload.table, payload.match || {}));
      default: return json({ ok: false, error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}

function json(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ... (rest of the functions from Code.gs)
```

## B.3 Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon ⚙️ and select **Web app**
3. Configure:
   - **Description**: `Frontbase RPC` (or any name)
   - **Execute as**: **Me** (your email)
   - **Who has access**: **Anyone with the link**
4. Click **Deploy**
5. **Copy the Web App URL** (format: `https://script.google.com/macros/s/.../exec`)

> **⚠️ Important**: "Anyone with the link" + shared secret is secure. The secret
> prevents unauthorized access.

## B.4 Configure in Frontbase

1. In Frontbase Builder, go to **Data Sources → Add Data Source**
2. From **Database Type**, select **Google Sheets**
3. Scroll past the add-on card to the manual fields and fill them in:

**Spreadsheet ID**
- Found in your Google Sheet URL: `docs.google.com/spreadsheets/d/`**`SPREADSHEET_ID`**`/edit`
- Example: `1AbCdEfGhIjKlMnOpQrStUvWxYz123456789`

**Web App URL**
- Paste the URL you copied in B.3
- Example: `https://script.google.com/macros/s/.../exec`

**Shared Secret**
- Click **Generate New** in Frontbase (or create your own)
- **Copy this secret**
- Go back to your Apps Script code
- Replace `YOUR_SECRET_HERE` with the actual secret
- **Redeploy** the Web App (Deploy → Manage deployments → Edit → redeploy)

## B.5 Test & Save

1. Click **Test Connection** to verify:
   - ✅ Web App is reachable
   - ✅ Secret matches
   - ✅ Worksheets/tables are discovered
2. Click **Add Data Source** to complete setup.

---

# Your Spreadsheet Schema

*Applies to both approaches.* After connection, Frontbase discovers:

- Each **tab/sheet** becomes a **table**
- The **header row** defines **column names** and **types** (inferred from data)
- An `id` column is auto-created (with sequential values) on any tab missing one,
  to support writes

**Example**: if you have tabs named `Users`, `Orders`, and `Products`, Frontbase
shows three tables.

# Writing Data

To write back to your sheet:

1. Configure a **key column** (unique identifier like `id`)
2. Use Frontbase's **insert**/**update**/**delete** operations
3. Changes appear in your Google Sheet in real-time

# Troubleshooting

**"Unauthorized" error**
- Check that your secret in Frontbase matches the one in Apps Script
- Remember to **redeploy** after changing the secret
- (Approach A) the secret is managed for you — just reconnect with a fresh code

**"Table not found" error**
- Verify the sheet/tab name matches exactly (case-sensitive)
- Check that the spreadsheet ID is correct

**No data appearing**
- Ensure row 1 is headers (not blank)
- Check that your sheet has at least one data row

**Add-on "Configure" fails (Approach A)**
- Make sure you're running it from inside the Google Sheet you want to connect
  (the add-on uses the active spreadsheet)
- The connect code expires after ~15 minutes — generate a new one and retry
- Your Google account must consent to the Apps Script scopes the add-on requests

**Slow performance**
- Large sheets (>10K rows) may be slow
- Consider using filters to reduce data transfer

# Security Notes

- The shared secret is your API key — keep it secure
- The Web App URL is public, but useless without the secret
- Frontbase stores the secret **encrypted** in the database
- "Anyone with the link" access is safe because of the secret requirement
- (Approach A) the secret is generated per-sheet by the add-on and transmitted
  over HTTPS only; it is never shown to you
- **Tenant isolation**: Your connect code is single-use and scoped to your tenant/project.
  It cannot be used to access another tenant's datasources.
- **Rate limiting**: The callback endpoint is rate-limited to prevent brute force attacks.
  Invalid/expired codes will result in a 429 after too many attempts.
- **Token security**: Connect codes expire after ~15 minutes and can only be used once.

# Advanced: Multi-Sheet Setup

If you have multiple spreadsheets:
1. Connect **each spreadsheet** (via the add-on or manual setup)
2. Create **separate datasources** in Frontbase (one per spreadsheet)
3. Each datasource connects to its respective sheet

# Code & Add-on Reference

- **Approach A add-on source:** `integrations/google-sheets-addon/` (manifest,
  wizard, embedded RPC — see its `README.md`)
- **Approach B full RPC code:** `integrations/google-sheets-rpc/Code.gs`

Both ship the same RPC contract (`ping` / `schema` / `rows` / `aggregate` /
`insert` / `update` / `delete`), invoked by the Frontbase edge over HTTPS.
