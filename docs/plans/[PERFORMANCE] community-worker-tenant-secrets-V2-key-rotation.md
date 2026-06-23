# Plan: V2 — Key Rotation & HKDF for Tenant Secrets

**Parent Plan:** `[PERFORMANCE] community-worker-tenant-secrets-in-statedb.md`
**Status:** 📋 Planning
**Last updated:** 2026-06-23
**Version:** 1.0

---

## Table of Contents

1. [Problem](#problem)
2. [Design Overview](#design-overview)
3. [Component 1: HKDF Key Derivation](#component-1-hkdf-key-derivation)
4. [Component 2: Key Rotation Workflow](#component-2-key-rotation-workflow)
5. [Implementation Plan](#implementation-plan)
6. [Migration Path](#migration-path)
7. [Testing Strategy](#testing-strategy)
8. [Operational Considerations](#operational-considerations)

---

## Problem

### Current State (V1)
- Each shared worker has a **random 256-bit key** (`FRONTBASE_SECRETS_KEY`) stored in `EdgeEngine.engine_config['secrets_key']`
- Key is Fernet-encrypted at rest, but **never rotates** after initial provisioning
- Losing the key means **permanent data loss** for tenant secrets
- No mechanism to re-encrypt secrets with a new key

### Key Rotation Requirements
1. **Compliance**: Many security standards require periodic key rotation (90-365 days)
2. **Incident Response**: If a key is compromised, all affected workers must re-encrypt with new keys
3. **Zero Downtime**: Rotation must not interrupt tenant traffic
4. **Atomicity**: Either all secrets rotate successfully, or none do (rollback capability)

### HKDF Benefits
- **Simpler key management**: Derive `FRONTBASE_SECRETS_KEY` from existing `system_key`
- **One source of truth**: Only `system_key` needs to be stored and rotated
- **No separate key generation**: Eliminates `secrets_key` from `engine_config`
- **Backward compatible**: Can opt-in per engine (migration from random key to derived key)

---

## Design Overview

### Key Rotation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Control Plane (FastAPI)                                                      │
│                                                                             │
│  1. Admin triggers rotation: POST /api/engines/{id}/rotate-secrets-key     │
│  2. Backend generates new key (or derives from system_key via HKDF)        │
│  3. Backend fetches ALL existing ciphertexts from worker state-DB          │
│  4. Backend decrypts with OLD key, re-encrypts with NEW key                │
│  5. Backend pushes new ciphertexts via batch endpoint                       │
│  6. Backend updates engine.secrets_key and deploys with new FRONTBASE_...   │
│  7. Worker decrypts with new key on next request                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Edge Worker                                                                  │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │ Old Key      │───▶│ Graceful     │───▶│ New Key      │                   │
│  │ (Active)     │    │ Transition   │    │ (Active)     │                   │
│  └──────────────┘    │ Period      │    └──────────────┘                   │
│                       │ (Both keys  │                                       │
│                       │  work)       │                                       │
│                       └──────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Graceful Transition Window
- During rotation, **both keys** are accepted
- Old key remains in env as `FRONTBASE_SECRETS_KEY_OLD` (temporary)
- New secrets encrypted with new key; old secrets still decryptable
- Window allows for rollback if issues arise

---

## Component 1: HKDF Key Derivation

### Why HKDF?
HKDF (HMAC-based Key Derivation Function) allows deriving cryptographically strong keys from an existing secret.

**Benefits:**
- Eliminates separate `secrets_key` storage
- Keys derived from `system_key` (already rotated)
- Deterministic (same system_key → same derived key)

### HKDF Specification

```
Input:
  - IKM (Input Key Material): system_key (decrypted, 32+ bytes)
  - Salt: engine-specific context (engine_id or "frontbase-secrets")
  - Info: "frontbase-tenant-secrets" (purpose binding)
  - L: 32 bytes (output key length)

Output:
  - 256-bit derived key for AES-GCM

Algorithm:
  - Extract: HMAC-SHA256(salt, IKM) → PRK
  - Expand: HMAC-SHA256(PRK, info || 0x01) → OKM (32 bytes)
```

### Implementation Notes

**Backend (Python):**
```python
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend

def derive_secrets_key_from_system_key(system_key: str, engine_id: str) -> str:
    """
    Derive FRONTBASE_SECRETS_KEY from system_key via HKDF-SHA256.
    
    Args:
        system_key: Decrypted system_key (raw bytes or base64)
        engine_id: Engine-specific context for salt
    
    Returns:
        Base64-encoded 256-bit derived key
    """
    import base64
    
    # Decode if base64
    if isinstance(system_key, str):
        ikm = base64.b64decode(system_key)
    else:
        ikm = system_key
    
    # Salt: engine-specific (deterministic per engine)
    salt = f"frontbase-secrets-{engine_id}".encode('utf-8')
    
    # Info: purpose binding
    info = b"frontbase-tenant-secrets"
    
    # Derive 32-byte key
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=info,
        backend=default_backend()
    )
    
    derived_key = hkdf.derive(ikm)
    return base64.b64encode(derived_key).decode('utf-8')
```

**Edge (TypeScript/WebCrypto):**
```typescript
/**
 * Derive FRONTBASE_SECRETS_KEY from system_key via HKDF.
 * 
 * Web Crypto API doesn't directly support HKDF, so we implement
 * HMAC-based extraction + expansion.
 */
async function deriveSecretsKeyFromSystemKey(
    systemKey: string,
    engineId: string
): Promise<string> {
    const ikm = base64ToBytes(systemKey);
    const salt = new TextEncoder().encode(`frontbase-secrets-${engineId}`);
    const info = new TextEncoder().encode('frontbase-tenant-secrets');
    
    // Extract: HMAC-SHA256(salt, IKM) → PRK
    const prkKey = await crypto.subtle.importKey(
        'raw',
        salt,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const prkBytes = await crypto.subtle.sign('HMAC', prkKey, ikm);
    
    // Expand: HMAC-SHA256(PRK, info || 0x01)
    const hkdfKey = await crypto.subtle.importKey(
        'raw',
        prkBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const expansionInput = new Uint8Array(info.length + 1);
    expansionInput.set(info);
    expansionInput[info.length] = 0x01;
    
    const okm = await crypto.subtle.sign('HMAC', hkdfKey, expansionInput);
    
    // Take first 32 bytes
    const derivedKey = okm.slice(0, 32);
    return bytesToBase64(derivedKey);
}

function bytesToBase64(bytes: Uint8Array): string {
    const bin = Array.from(bytes, b => String.fromCharCode(b));
    return btoa(bin.join(''));
}
```

### Migration Strategy (Random Key → HKDF)

**Option A: Immediate Cut-over**
1. Detect if `engine_config['secrets_key']` exists (old random key)
2. Compute derived key from `system_key`
3. Trigger rotation workflow (re-encrypt all secrets with derived key)
4. Remove `secrets_key` from config, use derived key going forward

**Option B: Gradual Migration (Recommended)**
1. Add `use_hkdf: true` flag to `engine_config`
2. On provision: use derived key by default
3. On rotation: migrate existing random-key engines to HKDF
4. Deprecate random key path in future version

---

## Component 2: Key Rotation Workflow

### API Endpoint

```
POST /api/engines/{engine_id}/rotate-secrets-key
Authentication: Bearer <admin_jwt> (platform admin only)
Request Body: {
  "strategy": "random" | "hkdf",           // Key generation strategy
  "window_seconds": 300,                  // Grace period for both keys (default 5 min)
  "dry_run": false                        // If true, only validate without executing
}

Response: {
  "status": "started" | "completed" | "failed",
  "rotation_id": "uuid",
  "old_key_version": 1,
  "new_key_version": 2,
  "tenants_affected": 42,
  "estimated_duration_seconds": 180
}
```

### Rotation States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Rotation State Machine                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ PENDING  │───▶│ RUNNING  │───▶│ COMPLETE │───▶│ CLEANUP  │             │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘             │
│       │              │               │               │                     │
│       │              ▼               │               │                     │
│       │         ┌────────┐          │               │                     │
│       └─────────│ FAILED │◀─────────┴───────────────┴─────────────────────│
│                 └────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rotation Algorithm

```
1. VALIDATE
   - Verify engine exists and is_shared
   - Verify secrets_key exists in engine_config
   - For HKDF: verify system_key exists

2. GENERATE NEW KEY
   - Random: os.urandom(32) → base64
   - HKDF: derive_secrets_key_from_system_key(system_key, engine_id)

3. FETCH EXISTING SECRETS
   - Call GET /api/import/secrets (new endpoint, system-key auth)
   - Returns ALL tenant_secrets rows (ciphertext only)

4. RE-ENCRYPT (bulk operation)
   - For each (tenant_slug, kind, ciphertext):
     a. Decrypt with OLD key
     b. Encrypt with NEW key
     c. Accumulate for batch push
   
   - Atomic: if ANY decryption fails, abort entire rotation

5. PUSH NEW SECRETS
   - Call POST /api/import/secrets/batch with new ciphertexts
   - Verify all succeeded (check results array)

6. UPDATE ENGINE
   - Update engine_config['secrets_key'] = new_key
   - Add engine_config['secrets_key_old'] = old_key (for transition window)
   - Commit to DB

7. REDEPLOY WORKER
   - Call existing redeploy endpoint
   - New env will have:
     - FRONTBASE_SECRETS_KEY = new_key
     - FRONTBASE_SECRETS_KEY_OLD = old_key (temporary)

8. MARK COMPLETE
   - Schedule cleanup task (delete old key after window expires)

9. CLEANUP (after window_seconds)
   - Remove engine_config['secrets_key_old']
   - Worker falls back to new key only
```

### Graceful Transition (Both Keys Valid)

**Edge Changes (`tenantSecrets.ts`):**

```typescript
async function getTenantSecret(
    kind: string,
    tenantSlug: string | undefined
): Promise<any> {
    if (!isMultiTenantSlug(tenantSlug)) return null;
    
    // ... cache and fetch logic ...
    
    const secretsKey = process.env.FRONTBASE_SECRETS_KEY;
    if (!secretsKey) {
        console.error('[TenantSecrets] FRONTBASE_SECRETS_KEY not set');
        return null;
    }
    
    // Try primary key first
    try {
        const plaintext = await decryptAesGcm(ciphertext, secretsKey);
        return JSON.parse(plaintext);
    } catch (error) {
        // Fallback to old key during transition window
        const oldKey = process.env.FRONTBASE_SECRETS_KEY_OLD;
        if (oldKey) {
            try {
                const plaintext = await decryptAesGcm(ciphertext, oldKey);
                // Lazy migration: re-encrypt with new key in background
                // (optional optimization)
                return JSON.parse(plaintext);
            } catch (oldError) {
                console.error('[TenantSecrets] Both keys failed');
                return null;
            }
        }
        return null;
    }
}
```

---

## Implementation Plan

### Phase 1: HKDF Foundation (Week 1)

**Backend:**
- [ ] Add `derive_secrets_key_from_system_key()` to `edge_secrets_push.py`
- [ ] Add `use_hkdf` flag to engine provisioning
- [ ] Update `build_engine_secrets()` to use HKDF when flag set
- [ ] Add tests for HKDF Python ↔ WebCrypto interop

**Edge:**
- [ ] Add `deriveSecretsKeyFromSystemKey()` to `tenantSecrets.ts`
- [ ] Update encryption/decryption to support derived keys
- [ ] Add tests for HKDF edge implementation

**Verification:**
- [ ] HKDF-derived key encrypts successfully
- [ ] Python encrypt → WebCrypto decrypt roundtrip passes
- [ ] Derived keys are deterministic (same input → same output)

### Phase 2: Rotation Infrastructure (Week 2)

**Backend:**
- [ ] Add `GET /api/import/secrets` endpoint (read all, system-key auth)
- [ ] Add rotation state tracking (new table or in-memory)
- [ ] Implement `rotate_secrets_key()` algorithm
- [ ] Add admin endpoint: `POST /api/engines/{id}/rotate-secrets-key`

**Edge:**
- [ ] Update `tenantSecrets.ts` to support `FRONTBASE_SECRETS_KEY_OLD`
- [ ] Add fallback logic (try new key, then old key)
- [ ] Add logging for transition state

**Verification:**
- [ ] Can fetch all existing secrets from worker
- [ ] Rotation completes successfully on test engine
- [ ] Old secrets decrypt during transition window
- [ ] Old secrets fail after cleanup

### Phase 3: Rotation UI & Automation (Week 3)

**Backend:**
- [ ] Add rotation status endpoint: `GET /api/engines/{id}/rotation-status`
- [ ] Add scheduled rotation job (cron for 90-day rotation)
- [ ] Add bulk rotation: `POST /api/engines/rotate-all` (platform-wide)

**Frontend (Optional):**
- [ ] Admin UI to trigger rotation
- [ ] Rotation progress indicator
- [ ] Rotation history log

**Verification:**
- [ ] Scheduled rotation runs automatically
- [ ] Bulk rotation processes multiple engines
- [ ] UI shows accurate progress

### Phase 4: Migration from Random Keys (Week 4)

**Backend:**
- [ ] Add migration script: detect random-key engines
- [ ] Trigger rotation to HKDF for migrated engines
- [ ] Deprecate random key path (log warnings)

**Verification:**
- [ ] Existing random-key engines successfully migrated
- [ ] New engines use HKDF by default
- [ ] Random key path still works (backward compatibility)

---

## Migration Path

### From V1 (Random Key) to V2 (HKDF + Rotation)

**Step 1: Deploy V2 Code (Additive)**
- Deploy new code with HKDF and rotation infrastructure
- No behavior change yet (feature flags off)

**Step 2: Enable Rotation Feature**
- Set `FEATURE_KEY_ROTATION_ENABLED=true`
- First rotation: random → random (test rotation workflow)

**Step 3: Migrate to HKDF (Optional)**
- For each engine:
  - Trigger rotation with `strategy: "hkdf"`
  - Verify all secrets re-encrypted
  - Remove old random key

**Step 4: Scheduled Rotation**
- Enable cron job for 90-day rotation
- Monitor first automated rotation

### Rollback Plan

**If rotation fails mid-process:**
1. Old key still valid (transition window)
2. Revert engine_config to old key only
3. Redeploy worker with old key env var
4. Investigate failure logs

**If HKDF migration fails:**
1. Fallback to random key generation
2. Retry HKDF migration after investigation

---

## Testing Strategy

### Unit Tests

**HKDF Tests:**
```python
def test_hkdf_deterministic():
    """Same system_key + engine_id → same derived key."""
    key1 = derive_secrets_key_from_system_key(system_key, "engine-1")
    key2 = derive_secrets_key_from_system_key(system_key, "engine-1")
    assert key1 == key2

def test_hkdf_different_per_engine():
    """Different engine_id → different derived key."""
    key1 = derive_secrets_key_from_system_key(system_key, "engine-1")
    key2 = derive_secrets_key_from_system_key(system_key, "engine-2")
    assert key1 != key2

def test_hkdf_interop():
    """Python HKDF matches WebCrypto HKDF."""
    py_key = derive_secrets_key_from_system_key(system_key, "engine-1")
    # Export test vector for WebCrypto validation
```

**Rotation Tests:**
```python
async def test_rotation_success():
    """Full rotation workflow completes."""
    result = await rotate_secrets_key(engine_id, strategy="random")
    assert result['status'] == 'completed'
    # Verify new key works
    assert await verify_decryption(engine_id, new_key)

async def test_rotation_rollback():
    """Rollback to old key works."""
    await rotate_secrets_key(engine_id, strategy="random")
    # Simulate failure
    await rollback_rotation(engine_id)
    # Verify old key still works

async def test_rotation_with_hkdf():
    """Rotation from random key to HKDF-derived key."""
    engine = create_engine_with_random_key()
    result = await rotate_secrets_key(engine.id, strategy="hkdf")
    assert result['status'] == 'completed'
    # Verify HKDF key works
```

### Integration Tests

```python
async def test_end_to_end_rotation():
    """Rotate key on live worker, verify no downtime."""
    # Setup: worker with existing secrets
    # Execute: rotation
    # Verify: requests succeed during rotation
    # Verify: new secrets decrypt with new key
    # Verify: old secrets fail after cleanup

async def test_bulk_rotation():
    """Rotate multiple engines in parallel."""
    engines = [create_shared_engine() for _ in range(5)]
    results = await rotate_all_secrets([e.id for e in engines])
    assert all(r['status'] == 'completed' for r in results)
```

### Edge Tests

```typescript
describe('Key Rotation', () => {
    it('decrypts with new key after rotation');
    it('falls back to old key during transition');
    it('fails with both keys after cleanup');
    it('derives correct key via HKDF');
});
```

### Security Tests

```python
async def test_rotation_isolation():
    """Rotation on engine A doesn't affect engine B."""
    engine_a = create_shared_engine()
    engine_b = create_shared_engine()
    await rotate_secrets_key(engine_a.id)
    # Verify engine B still works with its original key

async def test_compromised_key_scenario():
    """Simulate key compromise, verify rotation mitigates."""
    # Setup: attacker has old key
    # Execute: rotation
    # Verify: old key cannot decrypt new secrets
```

---

## Operational Considerations

### Monitoring

**Metrics to Add:**
```
- secret_rotation_duration_seconds{engine_id, status}
- secret_rotation_tenants_total{engine_id}
- secret_rotation_errors_total{engine_id, error_type}
- hkdf_key_derivation_total{engine_id}
- secret_decryption_fallback_old_key_total
- secret_decryption_failure_total
```

**Logging:**
```typescript
console.log(JSON.stringify({
    event: 'secret_rotation_started',
    engine_id,
    rotation_id,
    strategy: 'hkdf',
    tenants_count,
    timestamp: Date.now(),
}));
```

### Alerts

**Rotation Failures:**
- Alert if rotation fails for any engine
- Alert if rotation duration exceeds threshold (e.g., 10 minutes)

**Decryption Failures:**
- Alert if `secret_decryption_fallback_old_key_total` spikes (indicates transition window too short)
- Alert if `secret_decryption_failure_total` > 0 after cleanup

### Backward Compatibility

**Graceful Migration Path:**
- Old engines without `use_hkdf` flag continue using random keys
- Existing ciphertexts remain valid until rotated
- No forced migration (opt-in per engine)

### Performance Considerations

**Rotation Cost:**
- Decryption + re-encryption of N tenant secrets: ~O(N) time
- For 1000 tenants: estimated 2-5 minutes
- Optimization: parallel batch processing

**HKDF Overhead:**
- One-time computation per worker: <1ms
- Negligible compared to encryption/decryption

---

## Rollout Checklist

### Pre-Rollout
- [ ] V1 fully deployed and stable
- [ ] HKDF interop verified (Python ↔ WebCrypto)
- [ ] Rotation workflow tested on staging
- [ ] Monitoring dashboards updated
- [ ] Runbook created for rotation failures

### Rollout Phase 1: Internal Testing
- [ ] Deploy V2 to staging
- [ ] Test rotation on staging engine
- [ ] Test HKDF migration
- [ ] Verify rollback procedure

### Rollout Phase 2: Production (Canary)
- [ ] Deploy V2 to 1 production region
- [ ] Rotate 1 low-traffic engine
- [ ] Monitor for 24 hours
- [ ] Verify no tenant impact

### Rollout Phase 3: General Availability
- [ ] Deploy V2 to all regions
- [ ] Enable rotation feature globally
- [ ] Schedule first automated rotation (90 days out)

### Post-Rollout
- [ ] Monitor rotation metrics
- [ ] Review first automated rotation
- [ ] Update runbook based on learnings

---

## Summary

V2 adds two critical capabilities:

1. **HKDF Key Derivation**: Simplifies key management by deriving `FRONTBASE_SECRETS_KEY` from `system_key`. Eliminates separate key storage and aligns with existing rotation workflows.

2. **Key Rotation Workflow**: Enables secure, zero-downtime rotation of compromised or expired keys. Graceful transition window ensures no tenant impact.

**Implementation Timeline:** 4 weeks
**Risk Level:** Medium (modifies critical crypto operations)
**Dependencies:** V1 must be stable and deployed

---

## Appendix: Security Analysis

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Attacker obtains `FRONTBASE_SECRETS_KEY` | Rotate key, invalidate old ciphertexts |
| Attacker obtains `system_key` | Rotate system_key (existing workflow) → re-derive secrets keys |
| Rotation failure mid-process | Old key remains valid, rollback available |
| HKDF implementation bug | Fallback to random key generation |

### Compliance Alignment

- **NIST SP 800-57**: Key rotation within 365 days ✓
- **SOC 2**: Cryptographic key management controls ✓
- **PCI DSS**: Annual key rotation requirement ✓

---

**End of V2 Plan**
