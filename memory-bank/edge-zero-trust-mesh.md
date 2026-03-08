# Edge Zero Trust Mesh — Design Document

> **Status**: Backlog (see [backlog.md](./backlog.md))
> **Date**: 2026-03-08
> **Goal**: Enterprise-grade secure edge-to-edge communications without backend dependency after deployment

---

## Vision

A decentralized trust mesh where edge nodes authenticate each other using cryptographic identity — no central authority needed at runtime. Nodes and message brokers can be added or removed dynamically. Respects the **edge self-sufficiency principle**: zero backend communication post-deploy.

---

## Design Constraints

1. **No backend dependency post-deploy** — edges cannot phone home to refresh tokens or validate peers
2. **Dynamic topology** — new edges can join, old ones can be decommissioned
3. **Cross-provider** — must work on CF Workers, Deno Deploy, Supabase Edge (app-layer only, no TCP/tunnels)
4. **Message brokers** — edges may communicate via untrusted intermediaries (QStash, pub/sub)

---

## Architecture: Decentralized Trust Chain

### Deploy-Time (backend involved)

```
Backend (CA)
  ├── Generates CA keypair (EdDSA) — stored securely, never leaves backend
  ├── For each edge:
  │   ├── Generates unique edge keypair
  │   ├── Signs identity JWT with CA private key:
  │   │   { sub: "engine-abc", tenant: "t1", scope: ["read:state", "write:events"], exp: +7d }
  │   ├── Bakes into edge bundle:
  │   │   • Edge's own private key (env var)
  │   │   • Edge's signed identity JWT
  │   │   • CA public key (for verifying peers)
  │   │   • Peer registry (JSON: edge_id → public_key → URL → scopes)
  │   └── Deploys edge
```

### Runtime (no backend)

```
Edge A ──► creates per-request JWT:
           { iss: "engine-a", aud: "engine-b", iat: now, exp: +30s, jti: nonce }
       ──► signs with own private key
       ──► attaches identity cert (signed by CA)
       ──► sends to Edge B (or via message broker)

Edge B ──► Step 1: verify identity cert signature against CA public key ✓
       ──► Step 2: verify request JWT signature against Edge A's public key (from cert) ✓
       ──► Step 3: check: is Edge A in my peer registry? ✓
       ──► Step 4: check: does Edge A's scope allow this action? ✓
       ──► Step 5: check: is request JWT fresh? (exp, jti) ✓
       ──► processes request
```

---

## Use Cases

### 1. Edge-to-Edge State Sync
One edge pushes a user's session/cart/auth state to another edge in a different region. Both verify each other's identity before accepting data. No central backend involved.

### 2. Distributed Workflow Orchestration
Edge A processes a webhook → signs a job payload → sends to Edge B for rendering → Edge B sends result to Edge C for delivery. Each step is cryptographically verified. A compromised broker can't inject fake steps.

### 3. Multi-Tenant Isolation
Customer A's edges can only talk to Customer A's edges. The signed identity JWT carries a `tenant_id` scope. Edge B rejects any call where the cert doesn't match its tenant.

### 4. Edge-to-Edge API Gateway
A "gateway edge" authorizes incoming user requests, signs them, and forwards to internal "worker edges." Workers only accept signed requests from the gateway — even if someone discovers the worker's URL directly, they can't call it.

### 5. Secure Event Bus
Edge publishes signed events to QStash/pub/sub. Subscribing edges verify the publisher's signature before processing. The broker is treated as untrusted transport — it can route but can't forge.

### 6. Edge Fleet Management
Deploy a fleet of 20 edges across CF + Deno + Supabase. Each knows the others. If one goes rogue, revoke its cert in the next deploy cycle — all peers reject it automatically.

---

## Threat Model

| # | Attack | Risk | Impact | Mitigation |
|---|--------|------|--------|------------|
| 1 | **CA private key stolen** | 🔴 Critical | Attacker can mint new identities, impersonate any node | Encrypt CA key at rest, restrict to deploy pipeline only. Consider HSM for production. |
| 2 | **Single edge compromised** | 🟡 Medium | Attacker impersonates that one edge until cert expires | Short cert TTL (24h–7d), redeploy revocation list. Scope each edge's permissions minimally. |
| 3 | **Peer registry poisoning** | 🟡 Medium | Fake peer injected if shared state DB is used for discovery | Sign the peer registry with CA key. Edges reject unsigned updates. |
| 4 | **Replay attack** | 🟢 Low | Attacker captures and replays a signed request | `jti` (unique nonce) + `iat` (timestamp) in every JWT. Reject tokens older than 30s. |
| 5 | **Man-in-the-middle** | 🟢 Low | Attacker intercepts edge-to-edge traffic | Payloads are signed — MITM can read but can't modify. Add JWE encryption if confidentiality is also needed. |
| 6 | **Stolen edge bundle** | 🟡 Medium | Private key extracted from deployed code | Edge runtimes don't expose source. Store keys in env vars, not bundle source. Runtime compromise remains a risk. |
| 7 | **No real-time revocation** | 🟡 Medium | Compromised edge stays trusted until next deploy | Core trade-off of "no backend post-deploy." Mitigation: short TTLs, or allow a single CRL fetch endpoint as the one exception. |

> **#1 vulnerability**: The CA private key is the single point of failure. This is true for every PKI system including TLS itself.

---

## Libraries

### Primary: `jose` (single dependency)

| Feature | `jose` API | Notes |
|---------|-----------|-------|
| EdDSA key generation | `generateKeyPair('EdDSA')` | Ed25519 — fast, small keys, quantum-resistant-adjacent |
| Sign identity JWT | `new SignJWT(payload).sign(caPrivateKey)` | Backend signs at deploy time |
| Sign request JWT | `new SignJWT(payload).sign(edgePrivateKey)` | Edge signs per-request at runtime |
| Verify JWT | `jwtVerify(token, publicKey)` | Edge verifies peer's identity + request |
| JWKS key set | `createLocalJWKSet(keys)` | Bake peer public keys as JWKS into bundle |
| JWE encryption | `new CompactEncrypt(data).encrypt(key)` | Optional: encrypt payloads for confidentiality |

**Runtime compatibility**: Node.js ✅, Deno ✅, CF Workers ✅, Browsers ✅

### Supporting Libraries

| Library | Purpose | Runtime | When Needed |
|---------|---------|---------|-------------|
| `jose` | JWT signing, verification, JWKS, JWE | All | Core — required |
| `nanoid` | Generate unique `jti` nonces for replay protection | All | Core — required |
| `@std/crypto` (Deno) | Raw Ed25519 if not using jose | Deno only | Alternative |
| `hono/jwt` | Lighter JWT if already using Hono | All | Alternative |

### Backend (Python) — Deploy Pipeline

| Library | Purpose |
|---------|---------|
| `cryptography` | Generate EdDSA keypairs, sign identity certs |
| `PyJWT` or `python-jose` | Create signed JWT identity tokens |
| `secrets` (stdlib) | Generate secure random nonces |

---

## Implementation Outline

### Phase 1: Identity Issuance (Backend)

```python
# At deploy time — backend generates edge identity
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import jwt

# Generate edge keypair
edge_private = Ed25519PrivateKey.generate()
edge_public = edge_private.public_key()

# Sign identity JWT with CA's private key
identity_token = jwt.encode({
    "sub": engine_id,
    "tenant": tenant_id,
    "scope": ["read:state", "write:events"],
    "pub": serialize_public_key(edge_public),  # embed edge's public key
    "exp": deploy_time + timedelta(days=7),
}, ca_private_key, algorithm="EdDSA")

# Bake into edge's environment variables
env_vars = {
    "EDGE_PRIVATE_KEY": serialize_private_key(edge_private),
    "EDGE_IDENTITY": identity_token,
    "CA_PUBLIC_KEY": serialize_public_key(ca_public),
    "PEER_REGISTRY": json.dumps(peer_list),  # signed separately
}
```

### Phase 2: Request Signing (Edge Runtime)

```typescript
// Edge A calling Edge B
import { SignJWT, jwtVerify, importSPKI } from 'jose'

const requestToken = await new SignJWT({
  iss: EDGE_ID,
  aud: targetEdgeId,
  action: 'sync:state',
  payload_hash: sha256(body),  // bind token to payload
})
  .setProtectedHeader({ alg: 'EdDSA' })
  .setIssuedAt()
  .setExpirationTime('30s')
  .setJti(nanoid())
  .sign(myPrivateKey)

fetch(targetEdgeUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${requestToken}`,
    'X-Edge-Identity': EDGE_IDENTITY,  // CA-signed identity cert
  },
  body,
})
```

### Phase 3: Verification Middleware (Edge Runtime)

```typescript
// Hono middleware — verifies incoming edge-to-edge calls
import { jwtVerify } from 'jose'

app.use('/api/mesh/*', async (c, next) => {
  const identity = c.req.header('X-Edge-Identity')
  const request = c.req.header('Authorization')?.replace('Bearer ', '')

  // 1. Verify identity was signed by our CA
  const { payload: id } = await jwtVerify(identity, CA_PUBLIC_KEY)

  // 2. Verify request was signed by the claimed edge
  const edgePubKey = await importSPKI(id.pub, 'EdDSA')
  const { payload: req } = await jwtVerify(request, edgePubKey)

  // 3. Check peer registry
  if (!PEER_REGISTRY[id.sub]) throw new Error('Unknown peer')

  // 4. Check scope
  if (!id.scope.includes(req.action)) throw new Error('Insufficient scope')

  c.set('caller', id.sub)
  await next()
})
```

---

## Open Questions

1. **Dynamic peer discovery without backend** — how does Edge A learn about a newly deployed Edge C?
   - Option A: Shared state DB (Turso/KV) with CA-signed peer entries
   - Option B: Require redeploy of all peers (simplest, least flexible)
   - Option C: Gossip protocol — edges share peer updates with each other (complex)

2. **Revocation without backend** — how to revoke a compromised edge's identity?
   - Option A: Short TTL (24h–7d) + redeploy revokes naturally
   - Option B: CRL (Certificate Revocation List) in shared state DB
   - Option C: Allow one exception to "no backend" — a lightweight CRL fetch endpoint

3. **Message broker trust** — should QStash/pub/sub messages be double-signed?
   - Recommendation: Edge signature only. Broker is untrusted transport. Receiver validates edge signature regardless of delivery method.

---

## Blockchain-Inspired Enhancements

> We don't need an actual blockchain (no consensus, no mining, no ledger). But blockchain's **cryptographic primitives** directly address our open questions and risks.

### What We Take vs. What We Skip

| Blockchain Concept | Underlying Crypto | Use It? | Why |
|---|---|---|---|
| Wallet identity | EdDSA / secp256k1 keypairs | ✅ Already using | Same crypto as Ethereum/Solana wallets |
| Transaction signing | Digital signatures | ✅ Already using | JWT signing = transaction signing |
| Merkle tree | Hash tree for data integrity | ✅ **Add** | Tamper-proof peer registry |
| Hash chain | Each block references previous hash | ✅ **Add** | Tamper-proof audit logs |
| Decentralized Identity (DID) | Self-sovereign identity | 🟡 Future | Eliminates CA single point of failure |
| Distributed ledger | Consensus (PoW/PoS) | ❌ Skip | Solves problems we don't have |
| Smart contracts | On-chain logic | ❌ Skip | JWT scopes are simpler and faster |
| Token economics | Incentive mechanisms | ❌ Skip | All nodes are owned by same org |

---

### Enhancement 1: Merkle Tree Peer Registry

**Solves**: Open Question #1 (dynamic peer discovery) + Risk #3 (peer registry poisoning)

Instead of a flat JSON peer list, the peer registry is a **Merkle tree**. Each edge gets the Merkle root baked in at deploy. New peers can be added via shared state DB — edges verify updates against the root.

```
Merkle Root: 0xa3f8... (baked into every edge at deploy)
       ┌────────┴────────┐
   Hash(A+B)          Hash(C+D)
    ┌──┴──┐          ┌──┴──┐
 Hash(A) Hash(B)  Hash(C) Hash(D)
  │       │        │       │
Edge A  Edge B  Edge C  Edge D
```

**How new peer verification works**:

```typescript
import { MerkleTree } from 'merkletreejs'
import { sha256 } from '@noble/hashes/sha256'

// At deploy — backend builds tree
const leaves = peers.map(p => sha256(JSON.stringify(p)))
const tree = new MerkleTree(leaves, sha256)
const root = tree.getRoot().toString('hex')
// → root is baked into every edge

// At runtime — edge verifies a new peer claim
const leaf = sha256(JSON.stringify(newPeerClaim))
const proof = fetchFromSharedDB('proof_for_' + newPeerClaim.id)
const isValid = tree.verify(proof, leaf, root)  // no backend needed
```

**Properties**:
- ✅ Adding a peer = add leaf + publish Merkle proof to shared DB
- ✅ Edge verifies proof against baked-in root — no backend call
- ✅ Tamper-proof — forging a peer requires breaking SHA-256
- ⚠️ Removing a peer or large topology changes = new root = redeploy

---

### Enhancement 2: Hash Chain Audit Log

**Solves**: Risk #7 (no real-time revocation) + enterprise audit requirements

Each edge maintains a local **hash chain** of all inter-edge communications. If any entry is tampered with, the chain breaks — providing tamper-proof forensics.

```
Entry 0 (genesis)
  hash: sha256("genesis")

Entry 1
  caller: "edge-a"
  action: "sync:state"
  timestamp: 1709856000
  prev_hash: sha256("genesis")
  hash: sha256(caller + action + timestamp + prev_hash)

Entry 2
  caller: "edge-b"
  action: "read:cache"
  timestamp: 1709856030
  prev_hash: hash(Entry 1)
  hash: sha256(caller + action + timestamp + prev_hash)
```

```typescript
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

interface AuditEntry {
  caller: string
  action: string
  timestamp: number
  prev_hash: string
  hash: string
}

function appendAuditEntry(chain: AuditEntry[], caller: string, action: string): AuditEntry {
  const prev = chain.length > 0 ? chain[chain.length - 1].hash : 'genesis'
  const timestamp = Date.now()
  const data = `${caller}|${action}|${timestamp}|${prev}`
  const hash = bytesToHex(sha256(new TextEncoder().encode(data)))
  const entry = { caller, action, timestamp, prev_hash: prev, hash }
  chain.push(entry)
  return entry
}

function verifyChain(chain: AuditEntry[]): boolean {
  for (let i = 1; i < chain.length; i++) {
    const data = `${chain[i].caller}|${chain[i].action}|${chain[i].timestamp}|${chain[i - 1].hash}`
    const expected = bytesToHex(sha256(new TextEncoder().encode(data)))
    if (chain[i].hash !== expected || chain[i].prev_hash !== chain[i - 1].hash) return false
  }
  return true
}
```

**Properties**:
- ✅ Tamper-proof — any modification breaks the chain
- ✅ Post-incident forensics — see exactly when a compromise occurred
- ✅ No external dependency — runs entirely on-edge
- ✅ Exportable — dump chain to backend/S3 periodically for compliance
- ⚠️ Storage — grows linearly, but entries are tiny (~200 bytes each)

---

### Enhancement 3: Decentralized Identity (DID) — Future

**Solves**: Risk #1 (CA private key as single point of failure)

Instead of one central CA, each edge has a **self-sovereign identity** (DID). The "registry" is a shared state DB, not a blockchain.

```
did:frontbase:edge-abc → {
  publicKey: "ed25519:...",
  created: "2026-03-08T...",
  attestations: [
    { by: "did:frontbase:edge-xyz", sig: "..." },  // peer vouched for this identity
    { by: "did:frontbase:backend",  sig: "..." },   // backend vouched at deploy
  ]
}
```

**Trust model**: Instead of "CA signed it → trusted", it becomes "N peers vouched for it → trusted" (web of trust). This eliminates the CA SPOF but adds complexity.

**Decision**: Parked for future. The CA model is simpler and sufficient for initial implementation. DID becomes relevant when the mesh grows beyond a single org's control.

---

## Updated Risk Mitigations (with blockchain enhancements)

| # | Risk | Original Mitigation | + Blockchain Enhancement |
|---|------|---------------------|--------------------------|
| 1 | CA key stolen | Encrypt at rest, HSM | **DID (future)**: eliminates CA entirely via web-of-trust |
| 3 | Peer registry poisoned | Sign registry with CA | **Merkle tree**: tamper-proof verification without trusting the DB |
| 4 | Replay attack | jti + iat in JWT | **Hash chain**: replayed requests create duplicate chain entries → detectable |
| 7 | No real-time revocation | Short TTLs | **Hash chain audit**: compromised edge's actions are forensically traceable even without real-time revocation |

---

## Complete Library List

### Edge Runtime (TypeScript)

| Library | Purpose | Size | Required? |
|---------|---------|------|-----------|
| `jose` | JWT signing, verification, JWKS, JWE | ~45KB | ✅ Core |
| `nanoid` | Unique nonce generation (jti) | ~1KB | ✅ Core |
| `@noble/hashes` | SHA-256 for Merkle trees + hash chains | ~15KB | ✅ Blockchain enhancements |
| `merkletreejs` | Merkle tree construction + proof verification | ~12KB | ✅ Peer registry |
| `@noble/curves` | Low-level Ed25519/secp256k1 (alternative to jose) | ~20KB | 🟡 Alternative |
| `hono/jwt` | Lighter JWT if already using Hono | 0 (bundled) | 🟡 Alternative |

> **`@noble` family** (by Paul Miller): audited, zero-dependency, used by Ethereum ecosystem. Gold standard for edge crypto.

### Backend (Python)

| Library | Purpose | Required? |
|---------|---------|-----------|
| `cryptography` | EdDSA keypair generation, signing | ✅ Core |
| `PyJWT` | Create signed JWT identity tokens | ✅ Core |
| `secrets` (stdlib) | Secure random nonces | ✅ Core |
| `pymerkle` | Merkle tree construction for peer registries | ✅ Blockchain enhancements |
| `hashlib` (stdlib) | SHA-256 for hash chain verification | ✅ Blockchain enhancements |
