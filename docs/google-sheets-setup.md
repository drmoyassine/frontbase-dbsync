# Google Sheets Datasource Setup Guide

This guide walks you through connecting a Google Sheet as a datasource in Frontbase.

## Overview

Frontbase connects to Google Sheets via an **Apps Script Web App** that you deploy on your spreadsheet. This enables:

- Querying rows with filters, sorting, and pagination
- Aggregations (count, sum, average, min, max)
- Insert, update, and delete operations

## Prerequisites

- A Google Sheet with your data
- Access to Google Apps Script (free with any Google Account)

## Step 1: Prepare Your Spreadsheet

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

## Step 2: Deploy the Apps Script Web App

### 2.1 Open Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. A new tab will open with the Apps Script editor

### 2.2 Paste the Code

Copy the code from `integrations/google-sheets-rpc/Code.gs` in the Frontbase repository and paste it into the editor.

**Quick copy** (the essential parts):
```javascript
var FRONTBASE_SECRET = 'YOUR_SECRET_HERE'; // You'll set this in Step 3

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

### 2.3 Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon ⚙️ and select **Web app**
3. Configure:
   - **Description**: `Frontbase RPC` (or any name)
   - **Execute as**: **Me** (your email)
   - **Who has access**: **Anyone with the link**
4. Click **Deploy**
5. **Copy the Web App URL** (format: `https://script.google.com/macros/s/.../exec`)

> **⚠️ Important**: "Anyone with the link" + shared secret is secure. The secret prevents unauthorized access.

## Step 3: Configure in Frontbase

### 3.1 Navigate to Data Sources

1. In Frontbase Builder, go to **Data Sources**
2. Click **Add Data Source**

### 3.2 Select Google Sheets

1. From the Database Type dropdown, select **Google Sheets**
2. Fill in the configuration:

**Spreadsheet ID**
- Found in your Google Sheet URL: `docs.google.com/spreadsheets/d/`**`SPREADSHEET_ID`**`/edit`
- Example: `1AbCdEfGhIjKlMnOpQrStUvWxYz123456789`

**Web App URL**
- Paste the URL you copied from Step 2.4
- Example: `https://script.google.com/macros/s/.../exec`

**Shared Secret**
- Click **Generate New** in Frontbase (or create your own)
- **Copy this secret**
- Go back to your Apps Script code
- Replace `YOUR_SECRET_HERE` with the actual secret
- **Redeploy** the Web App (Deploy → Manage deployments → Edit → redeploy)

### 3.3 Test Connection

Click **Test Connection** to verify:
- ✅ Web App is reachable
- ✅ Secret matches
- ✅ Worksheets/tables are discovered

### 3.4 Save

Click **Add Data Source** to complete setup.

## Your Spreadsheet Schema

After connection, Frontbase discovers:
- Each **tab/sheet** becomes a **table**
- The **header row** defines **column names** and **types** (inferred from data)

**Example**: If you have tabs named `Users`, `Orders`, and `Products`, Frontbase will show three tables.

## Writing Data

To write back to your sheet:

1. Configure a **key column** (unique identifier like `id`)
2. Use Frontbase's **insert**/**update**/**delete** operations
3. Changes appear in your Google Sheet in real-time

## Troubleshooting

**"Unauthorized" error**
- Check that your secret in Frontbase matches the one in Apps Script
- Remember to **redeploy** after changing the secret

**"Table not found" error**
- Verify the sheet/tab name matches exactly (case-sensitive)
- Check that the spreadsheet ID is correct

**No data appearing**
- Ensure row 1 is headers (not blank)
- Check that your sheet has at least one data row

**Slow performance**
- Large sheets (>10K rows) may be slow
- Consider using filters to reduce data transfer

## Security Notes

- The shared secret is your API key — keep it secure
- The Web App URL is public, but useless without the secret
- Frontbase stores the secret encrypted in the database
- "Anyone with the link" access is safe because of the secret requirement

## Advanced: Multi-Sheet Setup

If you have multiple spreadsheets:
1. Deploy the Web App on **each spreadsheet**
2. Create **separate datasources** in Frontbase (one per spreadsheet)
3. Each datasource connects to its respective sheet

## Full Code Reference

For the complete Apps Script code, see:
`integrations/google-sheets-rpc/Code.gs` in the Frontbase repository.
