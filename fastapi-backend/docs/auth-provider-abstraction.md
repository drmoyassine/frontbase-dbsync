# Auth Provider Abstraction & Tenant Provisioning Design

## Overview

This document describes the authentication provider abstraction that enables pluggable auth backends (SuperTokens, Supabase) with a unified interface. The design allows seamless switching between providers without changing application code.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                            │
│  (auth.py, tenant_context.py, all protected endpoints)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AuthProvider Protocol                           │
│  (provider_protocol.py - defines interface)                     │
│  - login(), signup(), validate_session()                        │
│  - get_user_metadata(), set_user_metadata()                     │
│  - delete_user(), user_exists()                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ SuperTokensProviderImpl  │    │ SupabaseProviderImpl     │
│ (providers/supertokens)  │    │ (providers/supabase)     │
└──────────────────────────┘    └──────────────────────────┘
```

## Provider Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_PROVIDER` | No | `supertokens` | Provider type: `supertokens` or `supabase` |
| `SUPABASE_URL` | If Supabase | - | Supabase project URL |
| `SUPABASE_ANON_KEY` | If Supabase | - | Supabase anonymous key |
| `SUPABASE_JWT_SECRET` | If Supabase | - | JWT secret for token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | - | Service role key for admin operations |

### Provider Selection Logic

```python
from app.auth.provider import get_auth_provider

provider = get_auth_provider()
# Returns:
# - SuperTokensProviderImpl if AUTH_PROVIDER=supertokens (default cloud)
# - SupabaseProviderImpl if AUTH_PROVIDER=supabase
# - None if self-host mode (uses cookie auth)
```

## AuthProvider Protocol

### Core Methods

#### Authentication

```python
async def login(
    credentials: LoginCredentials,
    request: Request,
    response: Response,
) -> SessionInfo:
    """Authenticate user and create session with tenant claims."""

async def signup(
    credentials: SignupCredentials,
    request: Request,
    response: Response,
    metadata: Optional[UserMetadata] = None,
) -> SessionInfo:
    """Register user, provision tenant, create session."""
```

#### Session Management

```python
async def validate_session(request: Request) -> Optional[SessionInfo]:
    """Validate session from cookies/auth header."""

async def revoke_session(request: Request) -> None:
    """Terminate current session."""

async def refresh_session(request: Request) -> Optional[SessionInfo]:
    """Refresh expired session if supported."""
```

#### User Metadata

```python
async def get_user_metadata(user_id: str) -> UserMetadata:
    """Get tenant claims and metadata."""

async def set_user_metadata(user_id: str, metadata: UserMetadata) -> None:
    """Update tenant claims and metadata."""
```

#### User Management

```python
async def delete_user(user_id: str) -> None:
    """Permanently delete user and data."""

async def user_exists(email: str) -> bool:
    """Check if email is registered."""
```

## Tenant Provisioning

### Provisioning Flow

```
USER SIGNUP REQUEST
    │
    ├─> 1. VALIDATE slug format (3-50 chars, lowercase, hyphens)
    │
    ├─> 2. CHECK slug availability in database
    │
    ├─> 3. CREATE user in auth provider (SuperTokens/Supabase)
    │        │
    │        └─> On failure: return 409 if email exists
    │
    ├─> 4. BEGIN database transaction
    │        │
    │        ├─> CREATE User record (public.users)
    │        ├─> CREATE Tenant record (tenants)
    │        ├─> CREATE TenantMember record (tenant_members)
    │        ├─> CREATE Project record (project)
    │        ├─> CREATE AgentCreditBalance (agent_credit_balances)
    │        └─> STORE provider metadata
    │              ├─> SuperTokens: recipe_usermetadata table
    │              └─> Supabase: supabase_user_metadata table
    │
    ├─> 5. COMMIT transaction
    │        │
    │        └─> On failure: ROLLBACK + delete auth provider user
    │
    ├─> 6. CREATE session with tenant claims in access token
    │
    └─> 7. RETURN SessionInfo with tenant_id, tenant_slug, role
```

### TenantProvisioner Protocol

```python
class TenantProvisioner(ABC):
    """Protocol for tenant provisioning operations."""

    async def provision_tenant(
        db: DBSession,
        request: TenantProvisionRequest,
    ) -> TenantProvisionResult:
        """Create new tenant with all resources."""

    async def attach_user_to_tenant(
        db: DBSession,
        request: TenantAttachRequest,
    ) -> TenantAttachResult:
        """Attach user to existing tenant (invite accept)."""

    async def store_user_metadata(
        db: DBSession,
        user_id: str,
        tenant_id: str,
        tenant_slug: str,
        role: str = "owner",
    ) -> None:
        """Store tenant claims in provider metadata."""

    async def get_user_tenant_claims(
        db: DBSession,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve tenant claims from metadata."""
```

## Provider Differences

### SuperTokens

**Authentication:**
- Uses emailpassword recipe
- Password hashing: bcrypt (handled by SuperTokens)
- Session management: cookie-based with rotating refresh tokens

**Metadata Storage:**
- Tenant claims stored in `recipe_usermetadata` table
- Accessed via `supertokens_python.recipe.usermetadata`

**Session Tokens:**
- Access tokens include tenant claims in `access_token_payload`
- Tokens validated via SuperTokens backend recipe

**Tenant Provisioning:**
- Handled in `/api/auth/signup` endpoint
- User created via `supertokens_python.recipe.emailpassword.asyncio.sign_up`

**Password Reset:**
- Uses SuperTokens built-in emailpassword reset flow
- Tokens generated and validated by SuperTokens

### Supabase

**Authentication:**
- Uses Supabase Auth service
- JWT tokens signed with HS256
- Client typically handles auth via Supabase JS SDK

**Metadata Storage:**
- Tenant claims stored in custom `supabase_user_metadata` table
- Supabase's built-in user_metadata is limited

**Session Tokens:**
- JWT extracted from Authorization header or cookies
- Validated using `SUPABASE_JWT_SECRET`
- Claims extracted from `app_metadata` and custom table

**Tenant Provisioning:**
- Handled via `/api/auth/provision-tenant` endpoint
- User created client-side via Supabase SDK
- Backend validates JWT and provisions resources

**Password Reset:**
- Uses Supabase `/auth/v1/recover` endpoint
- Tokens handled by Supabase

## Database Schema

### Shared Tables (All Providers)

```sql
-- Tenant (workspace/organization)
CREATE TABLE tenants (
    id VARCHAR PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    owner_id VARCHAR REFERENCES users(id),
    plan VARCHAR(20) DEFAULT 'free',
    status VARCHAR(20) DEFAULT 'active',
    settings TEXT,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- Tenant membership
CREATE TABLE tenant_members (
    id VARCHAR PRIMARY KEY,
    tenant_id VARCHAR REFERENCES tenants(id),
    user_id VARCHAR REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'owner',
    created_at VARCHAR NOT NULL
);

-- User accounts
CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL,
    last_login_at VARCHAR
);

-- Agent credit quota
CREATE TABLE agent_credit_balances (
    id VARCHAR PRIMARY KEY,
    tenant_id VARCHAR REFERENCES tenants(id),
    daily_credits_remaining INTEGER DEFAULT 0,
    monthly_credits_remaining INTEGER DEFAULT 0,
    bonus_daily INTEGER DEFAULT 0,
    bonus_monthly INTEGER DEFAULT 0,
    total_consumed INTEGER DEFAULT 0,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);
```

### Provider-Specific Tables

**SuperTokens:** Uses built-in tables (recipe_usermetadata)

**Supabase:**
```sql
CREATE TABLE supabase_user_metadata (
    user_id VARCHAR PRIMARY KEY,
    tenant_id VARCHAR,
    tenant_slug VARCHAR,
    role VARCHAR(20) DEFAULT 'owner',
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);
```

## Migration Strategy

### Phase 1: Abstraction (Current)
- ✅ Refactor SuperTokens to use AuthProvider interface
- ✅ Create SupabaseProvider implementation
- ✅ Both providers coexist via AUTH_PROVIDER env var

### Phase 2: Parallel Operation
- Run both providers with feature flags
- Route subsets of users to each provider
- Monitor metrics and gather feedback

### Phase 3: Migration
- Export SuperTokens users and tenant data
- Import to Supabase while preserving tenant context
- Update webhooks, DNS, and integrations

### Phase 4: Cutover
- Switch default provider to Supabase
- Deprecate SuperTokens endpoints
- Remove SuperTokens dependencies after grace period

## Security Considerations

### JWT Validation (Supabase)

```python
# JWT must be verified with secret
payload = jwt.decode(
    token,
    jwt_secret,
    algorithms=["HS256"],
    options={"verify_aud": False},
)
```

### Tenant Isolation

- All queries scoped by `tenant_id`
- `TenantContext` middleware injects tenant_id
- Row-level security on shared tables

### Rate Limiting

- Signup rate limiting per IP/email
- Failed login attempt tracking
- Lockout after MAX_FAILED_ATTEMPTS (5)

### Data Integrity

- All provisioning in database transactions
- Rollback on failure
- Audit logging of all operations

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/signup` | Register and provision tenant |
| GET | `/api/auth/me` | Get current user session |
| POST | `/api/auth/logout` | Revoke session |

### Tenant Provisioning

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/provision-tenant` | Provision tenant for Supabase user |
| GET | `/api/auth/provision-status` | Check tenant provision status |
| GET | `/api/auth/check-slug/{slug}` | Check slug availability |

## Usage Examples

### Validate Session (Any Provider)

```python
from app.auth.provider import get_auth_provider
from fastapi import Request, Depends

async def get_current_user(request: Request):
    provider = get_auth_provider()
    if not provider:
        # Self-host mode: use cookie auth
        return get_master_admin_user(request)

    session_info = await provider.validate_session(request)
    if not session_info:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return session_info
```

### Provision Tenant (Any Provider)

```python
from app.auth.tenant_provisioning import TenantProvisioningService

result = await TenantProvisioningService.provision_tenant(
    db=db,
    user_id=user_id,
    email=email,
    workspace_name="My Workspace",
    slug="my-workspace",
    plan="free",
)
```

## Environment Setup

### SuperTokens (Default Cloud)

```bash
AUTH_PROVIDER=supertokens
SUPERTOKENS_CONNECTION_URI=*
SUPERTOKENS_API_KEY=*
```

### Supabase

```bash
AUTH_PROVIDER=supabase
SUPABASE_URL=https://*.supabase.co
SUPABASE_ANON_KEY=*
SUPABASE_JWT_SECRET=*
SUPABASE_SERVICE_ROLE_KEY=*  # Optional, for admin operations
```

## Testing

### Mock Provider for Testing

```python
from app.auth.provider_protocol import AuthProvider, SessionInfo

class MockAuthProvider(AuthProvider):
    """Mock provider for testing."""

    async def validate_session(self, request: Request) -> Optional[SessionInfo]:
        return SessionInfo(
            user_id="test-user",
            email="test@example.com",
            tenant_id="test-tenant",
            tenant_slug="test",
            role="owner",
        )
```

## Files Created

1. `app/auth/provider_protocol.py` - AuthProvider protocol definition
2. `app/auth/tenant_provisioning.py` - Tenant provisioning protocol
3. `app/auth/providers/__init__.py` - Provider implementations package
4. `app/auth/providers/supertokens.py` - SuperTokens implementation
5. `app/auth/providers/supabase.py` - Supabase implementation
6. `app/auth/provider.py` - Factory for provider instances

## Next Steps

1. Implement invite accept flow for both providers
2. Add comprehensive tests for provider switching
3. Create migration tool for SuperTokens → Supabase
4. Update documentation for deployment
5. Add monitoring for provider health
