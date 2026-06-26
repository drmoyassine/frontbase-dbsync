/**
 * Vault Audit Logging — thin facade over the state provider (Phase 2).
 *
 * Every secret operation (create / update / delete / read / rotate / export /
 * import / rollback) is recorded as an append-only row in `edge_secret_audit`.
 * Audit is best-effort: it NEVER throws and NEVER blocks the operation it
 * describes — route handlers call `logAuditOperation(...)` without `await`
 * (fire-and-forget), while tests may `await` it for deterministic assertions.
 *
 * Only Drizzle-backed providers (LocalSqlite, Turso) implement `logAudit`; on
 * other providers the facade silently no-ops, so audit is always safe to call.
 *
 * Retention is enforced by the provider on each write (see DrizzleStateProvider
 * `_pruneAuditEntries`): per-secret count (FRONTBASE_AUDIT_MAX_PER_SECRET,
 * default 100) and age (FRONTBASE_AUDIT_RETENTION_DAYS, default 30). Set
 * FRONTBASE_AUDIT_LOGGING=false to disable entirely.
 */

import { stateProvider } from '../storage/index.js';
import type {
    AuditEntry, AuditEntryInput, AuditOperation, AuditStatus,
} from '../storage/IStateProvider.js';

export type { AuditEntry, AuditOperation, AuditStatus };

/** Extra structured context attached to an audit entry. */
export interface AuditMetadata {
    rollbackFrom?: number;                         // rollback: previous active version
    rotationProgress?: { total: number; completed: number; failed: number };
    exportFormat?: number;
    imported?: number;                             // import: counts
    skipped?: number;
    failed?: number;
    [key: string]: unknown;
}

/** Returns true unless audit logging has been explicitly disabled. */
export function isAuditEnabled(): boolean {
    return process.env.FRONTBASE_AUDIT_LOGGING !== 'false';
}

/**
 * Record a vault operation. Resolves cleanly on any failure (logs to console) —
 * safe to call fire-and-forget from request handlers. No-op when audit is
 * disabled or the provider does not support it.
 */
export async function logAuditOperation(params: {
    operation: AuditOperation;
    secretName: string;
    version: number;
    status: AuditStatus;
    errorMessage?: string | null;
    initiatedBy: 'system' | 'api';
    metadata?: AuditMetadata;
}): Promise<void> {
    if (!isAuditEnabled()) return;
    if (typeof stateProvider.logAudit !== 'function') return;

    try {
        const entry: AuditEntryInput = {
            operation: params.operation,
            secretName: params.secretName,
            version: params.version,
            status: params.status,
            errorMessage: params.errorMessage ?? null,
            initiatedBy: params.initiatedBy,
            metadata: params.metadata ?? null,
        };
        await stateProvider.logAudit(entry);
    } catch (err) {
        // Never propagate — audit must not break the operation it describes.
        console.error('[Audit] Failed to log operation:', err);
    }
}

/** Recent audit entries for a single secret (newest first). Empty if unsupported. */
export async function getAuditHistory(secretName: string, limit: number = 50): Promise<AuditEntry[]> {
    if (typeof stateProvider.getAuditHistory !== 'function') return [];
    try {
        return await stateProvider.getAuditHistory(secretName, limit);
    } catch (err) {
        console.error('[Audit] Failed to fetch history:', err);
        return [];
    }
}

/** Paginated audit entries across all secrets (newest first). */
export async function getAuditEntries(
    limit: number = 100,
    offset: number = 0,
): Promise<{ entries: AuditEntry[]; total: number }> {
    if (typeof stateProvider.getAuditEntries !== 'function') return { entries: [], total: 0 };
    try {
        return await stateProvider.getAuditEntries(limit, offset);
    } catch (err) {
        console.error('[Audit] Failed to fetch entries:', err);
        return { entries: [], total: 0 };
    }
}
