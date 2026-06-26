/**
 * Vault Export / Import (Phase 2) — backup, restore, and migration.
 *
 * The export bundle contains every secret already in its AES-256-GCM ciphertext
 * form (encrypted with the engine's vault key). It is NOT re-encrypted by the
 * system key — the bundle is only retrievable behind system-key auth, and the
 * ciphertext is worthless without FRONTBASE_SYSTEM_KEY. The caller is
 * responsible for transporting it over a secure channel (HTTPS) and storing it
 * safely. Importing a bundle therefore requires the SAME vault key that
 * encrypted it (typically the same engine, or a clone with the same key).
 *
 * Integrity: a SHA-256 checksum over a canonical (key-sorted) serialization of
 * the secrets array lets import detect corruption or tampering. A format
 * version gates forward migration.
 *
 * Import Safety (Fixes #1, #2, #4):
 *   - Tier-3 secrets are rejected (never belong in vault)
 *   - Verify-then-write: decrypt with the active key BEFORE storing
 *   - Per-secret audit entries for full traceability
 */

import { stateProvider } from '../storage/index.js';
import { decryptSecret, getVaultSystemKey } from './edgeSecrets.js';
import type { AuditOperation } from '../storage/IStateProvider.js';

export const EXPORT_FORMAT_VERSION = 1;

export interface VaultSecretEntry {
    name: string;
    version: number;
    ciphertext: string;        // AES-256-GCM ciphertext (base64) — vault-key encrypted
    createdAt: string;
    updatedAt: string;
}

export interface VaultExport {
    formatVersion: number;
    exportedAt: string;
    secrets: VaultSecretEntry[];
    checksum: string;          // hex SHA-256 of canonicalSecrets(secrets)
}

export interface ImportOptions {
    force?: boolean;           // overwrite existing secrets (default: skip them)
    verifyOnly?: boolean;      // validate checksum + format, write nothing
}

export interface ImportResult {
    success: boolean;
    imported: number;
    skipped: number;
    failed: number;
    errors: Array<{ name: string; error: string }>;
    tier3Rejected?: string[];
}

/** Internal: audit entries generated during import (for per-secret audit logging). */
export interface ImportAuditEntries {
    name: string;
    operation: AuditOperation;
    status: 'success' | 'failure';
    error?: string;
}

/**
 * Deterministic JSON serialization (object keys sorted recursively). Lets the
 * checksum match regardless of how the bundle was pretty-printed or which key
 * order a producer used.
 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** Canonical, order-independent representation of a secrets array (sorted by name). */
export function canonicalSecrets(secrets: VaultSecretEntry[]): string {
    const sorted = [...secrets].sort((a, b) =>
        a.name === b.name ? a.version - b.version : a.name.localeCompare(b.name),
    );
    return stableStringify(sorted);
}

/** SHA-256 hex digest. */
export async function sha256(data: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Export the entire vault as an encrypted-at-rest bundle. Throws if the
 * provider does not support the vault.
 */
export async function exportVault(): Promise<VaultExport> {
    if (typeof stateProvider.listEdgeSecrets !== 'function' || typeof stateProvider.getEdgeSecret !== 'function') {
        throw new Error('Vault not supported by this state provider');
    }

    const metas = await stateProvider.listEdgeSecrets();
    const secrets: VaultSecretEntry[] = [];

    for (const meta of metas) {
        const row = await stateProvider.getEdgeSecret?.(meta.name);
        if (!row) continue;
        secrets.push({
            name: meta.name,
            version: row.version,
            ciphertext: row.value,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
        });
    }

    const checksum = await sha256(canonicalSecrets(secrets));

    return {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        secrets,
        checksum,
    };
}

/**
 * Import secrets from a bundle. Verifies the format version and checksum first.
 * By default existing secrets are skipped; pass `force: true` to overwrite.
 * Pass `verifyOnly: true` to validate without writing anything.
 *
 * Safety improvements (Fixes #1, #2):
 *   - Tier-3 secrets are rejected (FRONTBASE_STATE_DB doesn't belong in vault)
 *   - Verify-then-write: decrypt with active key BEFORE storing to avoid
 *     creating unrecoverable corrupted secrets
 *   - Returns detailed rejection reasons for skipped secrets
 */
export async function importVault(
    exportData: VaultExport,
    options: ImportOptions = {},
): Promise<ImportResult & { tier3Rejected?: string[] }> {
    if (exportData.formatVersion !== EXPORT_FORMAT_VERSION) {
        throw new Error(`Unsupported export format version: ${exportData.formatVersion}`);
    }

    const calculated = await sha256(canonicalSecrets(exportData.secrets ?? []));
    if (calculated !== exportData.checksum) {
        throw new Error('Checksum mismatch — export bundle is corrupted or tampered with');
    }

    if (options.verifyOnly) {
        return { success: true, imported: 0, skipped: exportData.secrets.length, failed: 0, errors: [] };
    }

    if (typeof stateProvider.setEdgeSecret !== 'function') {
        throw new Error('Vault not supported by this state provider');
    }

    // Tier-3 secrets that should never be imported (Fix #1)
    const TIER_3_SECRETS = new Set<string>(['FRONTBASE_STATE_DB']);

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ name: string; error: string }> = [];
    const tier3Rejected: string[] = [];
    const auditEntries: Array<{ name: string; operation: AuditOperation; status: 'success' | 'failure'; error?: string }> = [];

    const systemKey = getVaultSystemKey();
    if (!systemKey) {
        throw new Error('Vault not enabled — FRONTBASE_SYSTEM_KEY not configured');
    }

    for (const secret of exportData.secrets) {
        // Fix #1: Reject Tier-3 secrets
        if (TIER_3_SECRETS.has(secret.name)) {
            tier3Rejected.push(secret.name);
            skipped++;
            auditEntries.push({ name: secret.name, operation: 'import', status: 'failure', error: 'Tier-3 secret not allowed in vault' });
            continue;
        }

        try {
            const existing = await stateProvider.getEdgeSecret?.(secret.name);
            if (existing && !options.force) {
                skipped++;
                auditEntries.push({ name: secret.name, operation: 'import', status: 'failure', error: 'Skipped (already exists)' });
                continue;
            }

            // Fix #2: Verify-then-write — decrypt BEFORE storing
            try {
                const plaintext = await decryptSecret(secret.ciphertext, systemKey);
                // Re-encrypt with current vault key to ensure consistency
                const { encryptSecret } = await import('./edgeSecrets.js');
                const freshCiphertext = await encryptSecret(plaintext, systemKey);
                await stateProvider.setEdgeSecret?.(secret.name, freshCiphertext);
                imported++;
                auditEntries.push({ name: secret.name, operation: 'import', status: 'success' });
            } catch (decryptErr: any) {
                // Ciphertext is corrupted or encrypted with a different key
                failed++;
                const errorMsg = `Decryption failed: ${decryptErr?.message || 'Unknown error'}`;
                errors.push({ name: secret.name, error: errorMsg });
                auditEntries.push({ name: secret.name, operation: 'import', status: 'failure', error: errorMsg });
            }
        } catch (err: any) {
            failed++;
            const errorMsg = err?.message || 'Unknown error';
            errors.push({ name: secret.name, error: errorMsg });
            auditEntries.push({ name: secret.name, operation: 'import', status: 'failure', error: errorMsg });
        }
    }

    const result: ImportResult & { _auditEntries: ImportAuditEntries[] } = {
        success: failed === 0,
        imported,
        skipped,
        failed,
        errors,
        tier3Rejected,
        _auditEntries: auditEntries, // Internal — used by route handler for per-secret audit
    };
    return result as any; // Cast to hide internal field from public API
}
