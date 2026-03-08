# Centralized Keys & Credentials Management

> **Date**: 2026-03-08
> **Context**: Transitioning from scattered, plaintext edge provider credentials to a secure, unified credentials management system across all Frontbase services.

---

## 1. The Vision & Current State

**Current State (The Gaps):**
- **Edge Provider Credentials**: Stored as plaintext JSON in the `edge_providers_accounts` table.
- **Supabase Service Keys**: Stored encrypted in the `project_settings` table (via `encrypt_data()` and `decrypt_data()` from `database/utils.py`).
- **Scattered Logic**: Each service manually parses the JSON blob to extract what it needs (e.g., `cloudflare_api.py`, `deno_deploy_api.py`).
- **No audit trail or versioning**.

**The Vision (Unified State):**
All sensitive keys, API tokens, and credentials will be stored in a single unified schema, encrypted at rest. Frontbase central services (deployment, RLS, data fetching) will use a standardized helper utility to fetch and decrypt what they need on the fly seamlessly.

---

## 2. Architecture Overview

### Single Encrypted Store (Database Layer)
Instead of keys living everywhere, we introduce a unified model (or leverage an expanded `service_accounts` model):
- **Encrypted Column**: All secret values (tokens, passwords, private keys) are encrypted using Fernet AES-256 (via `cryptography`).
- **Metadata Column**: Non-secret derived data (e.g., org names, account IDs) is stored in a separate JSON column so it can be queried and displayed in the UI without decryption overhead.

### Helper Utility Layer (Service Layer)
A centralized Python utility (e.g., `security/credentials.py`) will be the **single source of truth** for key retrieval.

```python
# Example interface
def get_decrypted_provider_credentials(provider_id: str, db: Session) -> dict:
    # 1. Fetch encrypted blob from DB
    # 2. Decrypt using Fernet
    # 3. Return mapped dictionary for the specific provider
    ...
```
**Zero Regressions Guarantee:** 
Existing services (RLS, Edge Deploy, Data Fetching) will simply replace their raw DB column reads with calls to this helper function. Their internal logic won't change, ensuring no workflow breaks.

### Edge Environment Variables (Edge Layer)
**Rule: Secrets are NEVER stored in plaintext in the edge source code.**
When Frontbase deploys an edge engine (Deno, CF Workers, Supabase Edge), it:
1. Calls the backend helper to fetch decrypted credentials.
2. Injects these credentials purely as **Environment Variables** via the provider's API.
3. The provider (Cloudflare, Deno) handles encryption at rest for those environment variables on their end.
4. The edge code reads `Deno.env.get("MY_SECRET")` at runtime.

---

## 3. Migration Plan (Actionable Steps)

**Step 1: Unify the Utility Functions**
Move `encrypt_data()` and `decrypt_data()` out of `database/utils.py` into a shared core security module (e.g., `app/core/security.py`) so all routers can import it without circular dependencies.

**Step 2: Define Provider Schemas**
Define what is a "secret" vs "metadata" for each provider.
*Example:*
- **Cloudflare**: `api_token` (Secret), `account_id` (Metadata)
- **Supabase**: `service_key` (Secret), `project_ref` (Metadata)
- **Deno Deploy**: `access_token` (Secret), `org_name` (Metadata)

**Step 3: Database Migration**
- Create a script to iterate over `edge_providers_accounts`.
- For each row, parse the plaintext logic, encrypt the secret fields, move metadata to a derived column, and save.
- Update `provider_credentials` to only store the resulting encrypted payload.

**Step 4: Update Service Code**
Refactor services to use the new utility:
- `fastapi-backend/app/routers/edge_providers.py`
- `fastapi-backend/app/routers/cloudflare.py`
- `fastapi-backend/app/services/deno_deploy_api.py`

---

## 4. Edge-to-Edge Zero Trust Synergy

This centralized management is purely for **Frontbase Backend ↔ Providers**.
Once the edge nodes are deployed, they rely on the **[Edge Zero Trust Mesh](./edge-zero-trust-mesh.md)** for inter-edge communication. The backend uses this centralized credential system to authenticate with the provider's API to inject the self-sufficient Zero Trust keys (EdDSA keys) as environment variables during deploy time. 

---

## Conclusion & Next Session Preparedness

This unified encryption approach allows us to scale our integrations safely. It removes plaintext secrets from our database and standardizes how every internal Frontbase service interacts with external providers. This document acts as the blueprint for tomorrow's audit and implementation session.
