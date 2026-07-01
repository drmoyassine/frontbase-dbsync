import {
  init_storage,
  stateProvider
} from "./chunk-LMYJ5MDS.js";
import {
  init_IStateProvider,
  isMultiTenantSlug
} from "./chunk-HX3ZZUXN.js";
import {
  getApiKeysConfig,
  init_env
} from "./chunk-5YJ43IHE.js";

// src/config/tenantSecrets.ts
init_IStateProvider();
init_storage();
init_env();
function isValidTenantSlug(slug) {
  if (!slug || slug === "_default") return false;
  if (slug.length > 100) return false;
  return /^[a-z][a-z0-9_-]*$/i.test(slug);
}
var SECRET_CACHE = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 5 * 60 * 1e3;
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function decryptAesGcm(ciphertextB64, keyB64) {
  const keyData = base64ToBytes(keyB64);
  const raw = base64ToBytes(ciphertextB64);
  if (raw.length < 13) {
    throw new Error("ciphertext too short");
  }
  const nonce = raw.slice(0, 12);
  const encrypted = raw.slice(12);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}
var HKDF_SALT = "frontbase-secrets-v2";
var HKDF_INFO = "aes-256-gcm";
async function deriveSecretsKeyFromSystemKey(systemKey) {
  const ikm = new TextEncoder().encode(systemKey);
  const salt = new TextEncoder().encode(HKDF_SALT);
  const info = new TextEncoder().encode(HKDF_INFO);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    256
    // 32 bytes
  );
  return bytesToBase64(new Uint8Array(derivedBits));
}
async function resolveCandidateKeys() {
  const candidates = [];
  const active = process.env.FRONTBASE_SECRETS_KEY;
  if (active) candidates.push(active);
  const oldKey = process.env.FRONTBASE_SECRETS_KEY_OLD;
  if (oldKey) candidates.push(oldKey);
  if (candidates.length === 0) {
    const systemKey = getApiKeysConfig().systemKey;
    if (systemKey) {
      try {
        candidates.push(await deriveSecretsKeyFromSystemKey(systemKey));
      } catch (err) {
        console.error("[TenantSecrets] HKDF local derivation failed:", err);
      }
    }
  }
  return candidates;
}
async function decryptWithCandidates(ciphertextB64, kind) {
  const candidates = await resolveCandidateKeys();
  if (candidates.length === 0) {
    console.error("[TenantSecrets] No decryption key available on shared worker");
    return null;
  }
  let lastErr = null;
  for (const key of candidates) {
    try {
      const plaintextJson = await decryptAesGcm(ciphertextB64, key);
      return JSON.parse(plaintextJson);
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`[TenantSecrets] Decryption failed for kind=${kind} (all keys):`, lastErr);
  return null;
}
async function getTenantSecret(kind, tenantSlug) {
  if (!isMultiTenantSlug(tenantSlug)) return null;
  if (!isValidTenantSlug(tenantSlug)) {
    console.error(`[TenantSecrets] Invalid tenant slug format`);
    return null;
  }
  const cacheKey = `${tenantSlug}:${kind}`;
  const cached = SECRET_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.decryptedAt < CACHE_TTL_MS) {
    return cached.plaintext;
  }
  const ciphertext = await stateProvider.getTenantSecret(tenantSlug, kind);
  if (!ciphertext) return null;
  const plaintext = await decryptWithCandidates(ciphertext, kind);
  if (plaintext === null) return null;
  SECRET_CACHE.set(cacheKey, { plaintext, decryptedAt: Date.now() });
  return plaintext;
}
function invalidateTenantSecret(kind, tenantSlug) {
  if (!isValidTenantSlug(tenantSlug)) {
    console.error(`[TenantSecrets] Invalid tenant slug format in invalidate`);
    return;
  }
  SECRET_CACHE.delete(`${tenantSlug}:${kind}`);
}
function clearAllTenantSecretsCache() {
  SECRET_CACHE.clear();
}

export {
  deriveSecretsKeyFromSystemKey,
  getTenantSecret,
  invalidateTenantSecret,
  clearAllTenantSecretsCache
};
