/**
 * Vault Key Rotation (Phase 2).
 *
 * Re-encrypts every secret in the local vault from one system key to another,
 * without downtime. The control plane triggers this when FRONTBASE_SYSTEM_KEY
 * is rotated: each ciphertext is decrypted with the OLD key (falling back to
 * the NEW key so a partially-completed rotation is resumable/idempotent),
 * re-encrypted with the NEW key, verified, and stored back.
 *
 * Safety properties:
 *   - Idempotent: re-running with the same keys is a no-op (secrets already
 *     under the new key are decrypted via the new-key fallback and rewritten).
 *   - Per-secret atomicity: a failure on one secret does not abort the rest;
 *     failed secrets are reported and the operator can retry.
 *   - Verification: every re-encrypted value is decrypted again with the new
 *     key and compared to the original plaintext before the write is trusted.
 *
 * IMPORTANT (operational note, see docs/edge-local-vault-phase2.md): this
 * endpoint re-encrypts the *vault contents*. Actually switching the engine to
 * the new FRONTBASE_SYSTEM_KEY requires the backend to update the key and
 * redeploy — rotation is a coordinated, two-step operation.
 */

import { stateProvider } from '../storage/index.js';
import { encryptSecret, decryptSecret } from './edgeSecrets.js';

export interface RotationProgress {
    total: number;
    completed: number;
    failed: number;
    failedSecrets: Array<{ name: string; error: string }>;
}

export interface RotationResult {
    success: boolean;
    progress: RotationProgress;
    /** The new system key encrypted with the old key — keep for rollback. */
    newKeyEncryptedWithOld: string | null;
    /** Warning if rollback artifact encryption failed (Fix #6). */
    rollbackArtifactWarning?: string;
}

export interface VerifyResult {
    valid: boolean;
    total: number;
    corrupted: string[];
}

/**
 * Re-encrypt every vault secret under a new system key.
 *
 * @param oldSystemKey the key the vault is currently encrypted with
 * @param newSystemKey the key to re-encrypt everything with
 * @param onProgress   optional progress callback fired after each secret
 * @param timeoutMs    optional timeout in milliseconds (Fix #5 - default 60s)
 */
export async function rotateVaultKey(
    oldSystemKey: string,
    newSystemKey: string,
    onProgress?: (progress: RotationProgress) => void,
    timeoutMs: number = 60000, // Fix #5: 60 second default timeout
): Promise<RotationResult> {
    // Fix #5: Wrap entire operation in timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Rotation timed out')), timeoutMs);
    });

    const rotationPromise = (async (): Promise<RotationResult> => {
        if (typeof stateProvider.listEdgeSecrets !== 'function' || typeof stateProvider.getEdgeSecret !== 'function') {
            throw new Error('Vault not supported by this state provider');
        }
        if (oldSystemKey === newSystemKey) {
            throw new Error('New system key must differ from the old system key');
        }

        const metas = await stateProvider.listEdgeSecrets();

        const progress: RotationProgress = {
            total: metas.length,
            completed: 0,
            failed: 0,
            failedSecrets: [],
        };
        onProgress?.(progress);

        // Encrypt the new key with the old key first — a rollback artifact the
        // operator can decrypt later if they need to reverse the rotation.
        let newKeyEncryptedWithOld: string | null = null;
        let rollbackArtifactWarning: string | undefined;
        try {
            newKeyEncryptedWithOld = await encryptSecret(newSystemKey, oldSystemKey);
        } catch (err: any) {
            // Fix #6: Surface the warning in the response instead of just logging
            const warning = `Could not encrypt rollback artifact: ${err?.message || 'Unknown error'}`;
            console.warn('[Rotation]', warning);
            rollbackArtifactWarning = warning;
        }

        for (const meta of metas) {
            try {
                const row = await stateProvider.getEdgeSecret?.(meta.name);
                if (!row) {
                    throw new Error('Secret disappeared during rotation');
                }

                // Decrypt with the OLD key; fall back to the NEW key so an
                // interrupted rotation can be resumed without a split-brain.
                let plaintext: string;
                try {
                    plaintext = await decryptSecret(row.value, oldSystemKey);
                } catch {
                    try {
                        plaintext = await decryptSecret(row.value, newSystemKey);
                    } catch (decryptErr: any) {
                        throw new Error(`undecryptable with either key: ${decryptErr?.message || decryptErr}`);
                    }
                }

                // Re-encrypt under the NEW key.
                const newCiphertext = await encryptSecret(plaintext, newSystemKey);

                // Verify round-trip before committing.
                const verifyPlaintext = await decryptSecret(newCiphertext, newSystemKey);
                if (verifyPlaintext !== plaintext) {
                    throw new Error('verification failed — plaintext mismatch after re-encryption');
                }

                await stateProvider.setEdgeSecret?.(meta.name, newCiphertext);
                progress.completed++;
            } catch (err: any) {
                progress.failed++;
                progress.failedSecrets.push({ name: meta.name, error: err?.message || 'Unknown error' });
            }
            onProgress?.(progress);
        }

        return {
            success: progress.failed === 0,
            progress,
            newKeyEncryptedWithOld,
            rollbackArtifactWarning,
        };
    })();

    // Race between rotation and timeout
    return Promise.race([rotationPromise, timeoutPromise]);
}

/**
 * Verify that every vault secret can be decrypted with the given key. Returns
 * the list of secret names that fail (corrupted or encrypted under a different
 * key). Used by the rotate endpoint as a pre-flight check and by /api/health.
 */
export async function verifyVaultKey(systemKey: string): Promise<VerifyResult> {
    if (typeof stateProvider.listEdgeSecrets !== 'function' || typeof stateProvider.getEdgeSecret !== 'function') {
        return { valid: false, total: 0, corrupted: [] };
    }

    const metas = await stateProvider.listEdgeSecrets();
    const corrupted: string[] = [];

    for (const meta of metas) {
        try {
            const row = await stateProvider.getEdgeSecret?.(meta.name);
            if (!row) {
                corrupted.push(meta.name);
                continue;
            }
            await decryptSecret(row.value, systemKey);
        } catch {
            corrupted.push(meta.name);
        }
    }

    return {
        valid: corrupted.length === 0,
        total: metas.length,
        corrupted,
    };
}
