/**
 * Edge resilience — monitor → degrade → surface (Sprint 2D + 2B/2C).
 *
 * Tracks the health of the edge's OWN state DB + cache and degrades gracefully
 * when a binding approaches/exhausts its quota or fails outright:
 *   - cache   → swap to NullCacheProvider (no L2; reads just miss)
 *   - stateDb → on Docker, swap to LocalSqliteProvider; on cloud (no filesystem)
 *               mark degraded and let callers handle errors (there's no safe
 *               local fallback on CF Workers)
 *
 * State is surfaced via getResilienceState() → the /api/health `resilience` block
 * → the dashboard's health popover (degraded = amber).
 *
 * Quota counting is a HEURISTIC: an in-memory op counter checked against optional
 * FRONTBASE_DB_LIMITS / FRONTBASE_CACHE_LIMITS (ops/window) env values. It resets
 * on cold start, so it's most meaningful on the long-lived Docker edge; on
 * serverless (CF) it's a rough per-isolate signal. No limits configured ⇒ inert.
 */

type Level = 'ok' | 'degraded' | 'down';

export interface ComponentStatus {
    level: Level;
    reason?: string;
    since?: string;
    /** Approx ops counted this process (heuristic). */
    ops?: number;
}

export interface ResilienceState {
    stateDb: ComponentStatus;
    cache: ComponentStatus;
}

let _state: ResilienceState = {
    stateDb: { level: 'ok' },
    cache: { level: 'ok' },
};

export function getResilienceState(): Readonly<ResilienceState> {
    return _state;
}

export function markComponent(component: 'stateDb' | 'cache', level: Level, reason?: string): void {
    const prev = _state[component];
    if (prev.level === level && prev.reason === reason) return; // no-op if unchanged
    _state = {
        ..._state,
        [component]: { level, reason, since: new Date().toISOString(), ops: prev.ops },
    };
    console.warn(`[Resilience] ${component} → ${level}${reason ? ` (${reason})` : ''}`);
}

// ── Quota limits (ops per process window; heuristic) ──────────────────────

interface Limits { soft: number; hard: number; }

function parseLimits(env: string | undefined): Limits {
    if (!env) return { soft: Infinity, hard: Infinity };
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return { soft: Math.floor(n * 0.8), hard: n };
    return { soft: Infinity, hard: Infinity };
}

let DB_LIMITS = parseLimits(process.env.FRONTBASE_DB_LIMITS);
let CACHE_LIMITS = parseLimits(process.env.FRONTBASE_CACHE_LIMITS);

let _dbOps = 0;
let _cacheOps = 0;
let _dbDowngraded = false;
let _cacheDowngraded = false;

/**
 * Downgrade actions are injected by storage/index.ts + cache/index.ts to avoid a
 * circular import (this module must not import the provider factories).
 */
let _downgradeStateDb: (() => void) | null = null;
let _downgradeCache: (() => void) | null = null;

export function registerDowngraders(opts: { stateDb?: () => void; cache?: () => void }): void {
    if (opts.stateDb) _downgradeStateDb = opts.stateDb;
    if (opts.cache) _downgradeCache = opts.cache;
}

/** Count one state-DB operation; degrades when the quota threshold is crossed. */
export function recordStateDbOp(): void {
    if (DB_LIMITS.hard === Infinity) return;
    _dbOps++;
    _state = { ..._state, stateDb: { ..._state.stateDb, ops: _dbOps } };
    if (_dbOps >= DB_LIMITS.hard && !_dbDowngraded) {
        _dbDowngraded = true;
        markComponent('stateDb', 'down', `quota exhausted (~${_dbOps} ops)`);
        _downgradeStateDb?.();
    } else if (_dbOps >= DB_LIMITS.soft) {
        markComponent('stateDb', 'degraded', `approaching quota (~${_dbOps} ops)`);
    }
}

/** Count one cache operation; degrades when the quota threshold is crossed. */
export function recordCacheOp(): void {
    if (CACHE_LIMITS.hard === Infinity) return;
    _cacheOps++;
    _state = { ..._state, cache: { ..._state.cache, ops: _cacheOps } };
    if (_cacheOps >= CACHE_LIMITS.hard && !_cacheDowngraded) {
        _cacheDowngraded = true;
        markComponent('cache', 'down', `quota exhausted (~${_cacheOps} ops)`);
        _downgradeCache?.();
    } else if (_cacheOps >= CACHE_LIMITS.soft) {
        markComponent('cache', 'degraded', `approaching quota (~${_cacheOps} ops)`);
    }
}

/** Test-only: reset counters + state. */
export function _resetResilienceForTests(): void {
    _dbOps = 0;
    _cacheOps = 0;
    _dbDowngraded = false;
    _cacheDowngraded = false;
    _state = { stateDb: { level: 'ok' }, cache: { level: 'ok' } };
}

/** Test-only: override the parsed limits (Infinity = no enforcement). */
export function _setLimitsForTests(db?: Limits, cache?: Limits): void {
    if (db) DB_LIMITS = db;
    if (cache) CACHE_LIMITS = cache;
}
