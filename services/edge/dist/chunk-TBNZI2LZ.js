import {
  getApiKeysConfig,
  init_env
} from "./chunk-5YJ43IHE.js";
import {
  __esm
} from "./chunk-KFQGP6VL.js";

// src/config/edgeSecrets.ts
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes) {
  const CHUNK = 32768;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
async function deriveVaultKey(systemKey) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(systemKey),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(HKDF_SALT),
      info: encoder.encode(HKDF_INFO)
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
function getVaultSystemKey() {
  return getApiKeysConfig().systemKey || null;
}
async function encryptSecret(plaintext, systemKey) {
  const key = await deriveVaultKey(systemKey);
  const encoder = new TextEncoder();
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encoder.encode(plaintext)
  );
  const ctBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(nonce.length + ctBytes.length);
  combined.set(nonce, 0);
  combined.set(ctBytes, nonce.length);
  return bytesToBase64(combined);
}
async function decryptSecret(ciphertextB64, systemKey) {
  if (ciphertextB64.length < 16) {
    throw new Error("ciphertext too short");
  }
  const key = await deriveVaultKey(systemKey);
  const raw = base64ToBytes(ciphertextB64);
  const nonce = raw.subarray(0, NONCE_LENGTH);
  const encrypted = raw.subarray(NONCE_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}
var HKDF_SALT, HKDF_INFO, NONCE_LENGTH;
var init_edgeSecrets = __esm({
  "src/config/edgeSecrets.ts"() {
    init_env();
    HKDF_SALT = "frontbase-secrets-v2";
    HKDF_INFO = "edge-secrets-encryption";
    NONCE_LENGTH = 12;
  }
});

export {
  getVaultSystemKey,
  encryptSecret,
  decryptSecret,
  init_edgeSecrets
};
