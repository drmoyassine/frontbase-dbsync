# Database API Endpoints Documentation

This document provides comprehensive documentation for all database-related API endpoints used in the Frontbase application.

## Overview

All database endpoints require authentication via session cookies. The API uses RESTful conventions and returns JSON responses with a consistent structure:

```json
{
  "success": boolean,
  "data": any,
  "error": string (optional)
}
```

## Authentication

All endpoints require a valid session token. The session token is automatically included when using `credentials: 'include'` in fetch requests.

## Database Connection Endpoints

### GET /api/database/connections

Retrieves all configured database connections.

**Authentication:** Required
**Method:** GET

**Response:**
```json
{
  "success": true,
  "data": {
    "supabase": {
      "connected": boolean,
      "url": string,
      "hasAnonKey": boolean,
      "hasServiceKey": boolean
    }
  }
}
```

### POST /api/database/connect-supabase

Connects to a Supabase database instance.

**Authentication:** Required
**Method:** POST

**Request Body:**
```json
{
  "url": "https://your-project.supabase.co",
  "anonKey": "eyJ...",
  "serviceKey": "eyJ..." (optional),
  "includeServiceKey": boolean
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Supabase connected successfully"
  }
}
```

### POST /api/database/test-supabase

Tests a Supabase connection without saving it.

**Authentication:** Required
**Method:** POST

**Request Body:**
```json
{
  "url": "https://your-project.supabase.co",
  "anonKey": "eyJ...",
  "serviceKey": "eyJ..." (optional)
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Connection successful",
    "authMethod": "anon" | "service"
  }
}
```

### DELETE /api/database/disconnect-supabase

Disconnects and removes Supabase connection.

**Authentication:** Required
**Method:** DELETE

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Supabase disconnected successfully"
  }
}
```

## Table Management Endpoints

### GET /api/database/tables

Retrieves all tables from the connected Supabase database.

**Authentication:** Required
**Method:** GET

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "table_name": "users",
      "table_schema": "public"
    },
    {
      "table_name": "posts",
      "table_schema": "public"
    }
  ]
}
```

**Common Issues:**
- Returns empty array if no service key is provided
- Requires proper RLS policies or service key for full table access

## Table Data Endpoints

### GET /api/database/table-data/:tableName

Retrieves paginated data from a specific table.

**Authentication:** Required
**Method:** GET
**URL Parameters:**
- `tableName` (string): Name of the table to query

**Query Parameters:**
- `limit` (number, optional): Number of records to return (default: 20, max: 100)
- `offset` (number, optional): Number of records to skip (default: 0)

**Example Request:**
```
GET /api/database/table-data/users?limit=20&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "authMethod": "service" | "anon",
  "total": 150
}
```

**Common Issues:**
- Returns empty data if RLS policies block access
- Limited functionality with anon key vs service key
- May return fewer records than requested due to RLS policies

## Table Schema Endpoints

### GET /api/database/table-schema/:tableName

Retrieves the schema/structure information for a specific table.

**Authentication:** Required
**Method:** GET
**URL Parameters:**
- `tableName` (string): Name of the table to get schema for

**Example Request:**
```
GET /api/database/table-schema/users
```

**Response:**
```json
{
  "success": true,
  "data": {
    "columns": [
      {
        "column_name": "id",
        "data_type": "bigint",
        "is_nullable": "NO",
        "column_default": "nextval('users_id_seq'::regclass)"
      },
      {
        "column_name": "name",
        "data_type": "text",
        "is_nullable": "YES",
        "column_default": null
      },
      {
        "column_name": "email",
        "data_type": "text",
        "is_nullable": "NO",
        "column_default": null
      }
    ]
  }
}
```

**CRITICAL FRONTEND PARSING:**
```javascript
// ❌ WRONG - This will cause "Cannot read properties of undefined (reading 'length')"
const columns = schemaResult.columns;

// ✅ CORRECT - Access columns from the data property
const columns = schemaResult.data.columns || [];
```

**Common Issues:**
- **Frontend parsing error**: The schema data is nested under `data.columns`, not directly in `columns`
- May return limited schema info with anon key
- Requires service key for full schema access including constraints and indexes

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common Error Codes:**
- `401`: Unauthorized - Invalid or expired session
- `400`: Bad Request - Invalid request parameters
- `500`: Internal Server Error - Server-side error

## Authentication Requirements

### Session Management
- All requests must include session cookies
- Use `credentials: 'include'` in fetch requests
- Sessions expire after 7 days by default

### Supabase Authentication
- **Anon Key**: Limited read access, subject to RLS policies
- **Service Key**: Full database access, bypasses RLS policies
- Choose authentication method based on security requirements

## Troubleshooting Common Issues

### 1. "Cannot read properties of undefined (reading 'length')"
**Problem:** Trying to access `schemaResult.columns` instead of `schemaResult.data.columns`

**Solution:**
```javascript
// Always access schema columns like this:
const columns = schemaResult?.data?.columns || [];
```

### 2. Empty Tables List
**Problem:** No tables returned from `/api/database/tables`

**Possible Causes:**
- No service key provided (anon key has limited access)
- RLS policies blocking access
- Invalid Supabase connection

**Solution:**
- Ensure service key is provided for full access
- Check RLS policies in Supabase dashboard
- Verify connection status

### 3. Empty Table Data
**Problem:** Table exists but no data returned

**Possible Causes:**
- RLS policies blocking data access
- Using anon key instead of service key
- Invalid table name

**Solution:**
- Use service key for admin access
- Configure appropriate RLS policies
- Verify table name spelling

### 4. Connection Lost on Container Restart
**Problem:** Supabase connection lost after Docker container restart

**Cause:** Missing or invalid `ENCRYPTION_KEY` environment variable

**Solution:**
```bash
# Generate a secure encryption key
node -p "require('crypto').randomBytes(32).toString('hex')"

# Set it in your environment
export ENCRYPTION_KEY=your_generated_key_here
```

## Security Best Practices

1. **Always use HTTPS** in production
2. **Rotate encryption keys** regularly
3. **Use service keys sparingly** - prefer RLS policies
4. **Set up proper RLS policies** in Supabase
5. **Monitor database access** logs
6. **Use environment variables** for sensitive data

## Rate Limiting

- Table data endpoints: 100 requests per minute per session
- Schema endpoints: 50 requests per minute per session
- Connection endpoints: 10 requests per minute per session

## Encryption

All Supabase credentials are encrypted before storage using AES-256-GCM encryption. The encryption key must be provided via the `ENCRYPTION_KEY` environment variable.

**Key Generation:**
```bash
node -p "require('crypto').randomBytes(32).toString('hex')"
```

**Key Storage:**
- Environment variable: `ENCRYPTION_KEY`
- Docker: Pass via docker-compose.yml
- Production: Use secure key management system