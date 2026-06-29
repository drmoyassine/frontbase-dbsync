# Security & RAG Isolation Model

> **Last Updated:** 2026-06-29
> **Scope:** Multi-tenant security settings and RAG document access

---

## Executive Summary

Frontbase implements a **layered isolation model** for security and RAG features:

1. **Platform-level security** (WAF, global audit logs) → Master Admin only
2. **Tenant-level security** (bot protection, IP blocklist) → Per-tenant, isolated
3. **RAG document access** → Multi-tenant metadata filtering with client_id extraction

---

## Security Settings Isolation

### Platform-Level (Master Admin Only)

| Endpoint | Scope | Access | Rationale |
|-----------|-------|--------|-----------|
| `/api/auth/security/waf` | Global | Master Admin | WAF protects the entire platform - tenants must NOT disable it |
| `/api/auth/security/audit-logs` | Global | Master Admin | Full audit trail contains all tenants' data - isolation breach |

**Implementation:**
```python
# Strictly master admin only
@router.get("/security/waf")
async def get_waf_settings(request: Request):
    user = get_current_user(request)  # Only checks master admin session
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
```

**Frontend:**
- "Firewall & Headers" tab hidden from tenant users
- "Audit Trail" tab hidden from tenant users
- Default tab for tenants: "Bot Protection"

---

### Tenant-Level (Per-Tenant, Isolated)

| Endpoint | Scope | Access | Isolation |
|-----------|-------|--------|-----------|
| `/api/auth/security/bot-protection` | Per-tenant | Tenant + Master | Tenant-scoped settings |
| `/api/auth/security/bot-protection/metrics` | Per-tenant | Tenant + Master | Tenant-scoped metrics |
| `/api/auth/security/blocklist` | Per-tenant | Tenant + Master | Tenant-scoped IP bans |

**Implementation:**
```python
# Support both master admin and tenant users
@router.get("/security/blocklist")
async def get_blocklist(
    request: Request,
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user and not ctx:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Enforce tenant isolation
    tenant_id = ctx.tenant_id if ctx else None
    if tenant_id:
        bans = db.query(IPBlocklist).filter(IPBlocklist.tenant_id == tenant_id)
    else:
        bans = db.query(IPBlocklist).filter(IPBlocklist.tenant_id.is_(None))
```

**Frontend:**
- "Bot Protection" tab visible to all
- "Access Control" tab visible to all
- Data automatically scoped to tenant

---

## RAG Document Isolation

### Multi-Tenant Metadata Filtering

RAG documents are isolated using **metadata filters** extracted from file paths:

| Metadata | Source | Isolation |
|----------|--------|-----------|
| `tenant_id` | Request context | Required - filters to tenant's documents |
| `project_id` | Request context | Optional - filters to project scope |
| `client_id` | File path extraction | `/clients/{id}/*` → `client_id: {id}` |
| `bucket` | Source config | Filters to specific storage bucket |
| `source_config_id` | RAG config | Filters to specific indexing configuration |

### File Path Extraction Pattern

```typescript
// DEFAULT_METADATA_PATTERNS in rag/config.ts
const DEFAULT_METADATA_PATTERNS = {
    // Client isolation: /clients/{id}/docs/*, /client-{id}/*
    client_id: /\/(?:clients|client-|users?|user-)([a-zA-Z0-9_-]+)\//i,

    // Document type: /invoices/*, /contracts/*
    doc_type: /\/(invoices?|contracts?|proposals|receipts|statements)\//i,

    // Year/month for time-based filtering: /2024/06/, /2024-june/
    year: /\/(\d{4})\//,
    month: /\/(\d{2})\//i,

    // Department: /hr/*, /finance/*, /legal/*
    department: /\/(hr|finance|legal|engineering|sales|marketing|support)\//i,
};
```

### Search with Tenant Isolation

```typescript
// RAG search enforces tenant_id filter
export async function searchRagDocuments(
    query: string,
    options: RagSearchOptions = {}
) {
    const vectorFilters: Record<string, any> = {};
    
    // ALWAYS filter by tenant_id (if present)
    if (options.tenant_id) {
        vectorFilters.tenant_id = options.tenant_id;
    }
    
    // Optional: client_id for multi-tenant document isolation
    if (options.filters?.client_id) {
        vectorFilters.client_id = options.filters.client_id;
    }

    return vectorAdapter.search(tableName, queryVector, limit, vectorFilters);
}
```

### Agent Tools with Tenant Validation

```typescript
// RAG tools validate tenant context before search
function validateTenantContext(profile: AgentProfile, targetTenantId?: string) {
    if (profile.tenantSlug && targetTenantId && targetTenantId !== profile.tenantSlug) {
        throw new Error(`Tenant isolation violation: profile ${profile.name} cannot access tenant ${targetTenantId}`);
    }
}
```

---

## Edge Self-Sufficiency

### Vector Store Access (No Backend API Calls)

RAG implementation uses **direct vector store adapters** instead of localhost HTTP calls:

| Provider | Adapter | Cloud Support |
|----------|---------|----------------|
| libSQL (Turso) | `LibSqlVectorAdapter` | ✅ Yes |
| Cloudflare Vectorize | `VectorizeAdapter` | ✅ Yes |
| LanceDB | `LanceDbAdapter` | ❌ Docker only |
| pgvector (Supabase/Neon) | `PgVectorAdapter` | ✅ Yes |

**Security Validations:**
```typescript
// Bucket name validation (prevents injection)
function validateBucketName(bucket: string): void {
    const valid = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/.test(bucket);
    if (!valid) throw new Error(`Invalid bucket name: ${bucket}`);
}

// Path traversal prevention
function sanitizePath(path: string): string {
    return path.replace(/^\.?\.\//, '')  // Remove ../
                .replace(/^\/+/, '')       // Remove leading /
                .replace(/\\/g, '/');      // Normalize backslashes
}
```

### Storage Adapter Pattern (Direct Provider Access)

```typescript
// No backend API calls - edge self-sufficiency
const adapter = getStorageAdapter();  // Supabase, R2, etc.
const files = await adapter.listFiles(bucket, folderPath);

// Direct download
const { buffer, contentType } = await adapter.downloadFile(bucket, path);
```

---

## Authentication vs Authorization

### Critical Distinction

**Authentication (Who are you?):**
- Master admin → `frontbase_session` cookie
- Tenant user → SuperTokens JWT

**Authorization (What can you do?):**
- Platform-level actions → Master admin ONLY
- Tenant-level actions → Tenant-scoped, isolated

### The Mistake to Avoid

❌ **WRONG:** Making all endpoints work for tenants
```python
# This exposes platform-level settings to ALL tenants
if not user and not ctx:
    raise HTTPException(status_code=401)
```

✅ **CORRECT:** Analyze each endpoint's business purpose
```python
# Platform-level (WAF) → Master admin only
user = get_current_user(request)
if not user:
    raise HTTPException(status_code=401)

# Tenant-level (bot protection) → Both supported
user = get_current_user(request)
if not user and not ctx:
    raise HTTPException(status_code=401)
# Then enforce tenant isolation in data access
```

---

## Security Checklist

When implementing new security/RAG features:

- [ ] Determine if feature is **platform-level** or **tenant-level**
- [ ] Platform-level: Use `get_current_user()` only (master admin)
- [ ] Tenant-level: Use `get_current_user()` OR `get_tenant_context()`
- [ ] Add `tenant_id` filter to all database queries
- [ ] Validate bucket names and file paths (injection prevention)
- [ ] Use direct adapters (no localhost API calls)
- [ ] Extract metadata from file paths for client isolation
- [ ] Test with both master admin and tenant users

---

## Related Documentation

- [Phase 2.1 Security Audit](phase-2.1-security-audit-report.md) - SSRF protection, tenant isolation
- [Edge Zero Trust Mesh](security/edge-zero-trust-mesh.md) - Edge security architecture
- [Keys Management](security/keys-management.md) - Secret handling
