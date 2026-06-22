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
    /** Cache TTL multiplier (1.0 = full, 0.5 = degraded/clamped at soft quota). */
    ttlMultiplier?: number;
    /** Cache effectiveness counters (Sprint 3C) — hits/misses on `get`. */
    cacheStats?: { hits: number; misses: number };
}

let _state: ResilienceState = {
    stateDb: { level: 'ok' },
    cache: { level: 'ok' },
};

export function getResilienceState(): Readonly<ResilienceState> {
    // ttlMultiplier + cacheStats are read live so health always reflects the current values.
    return {
        ..._state,
        ttlMultiplier: _ttlMultiplier,
        cacheStats: { hits: _cacheHits, misses: _cacheMisses },
    };
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

// ── TTL clamping (Sprint 2C / Sweep Gap 3) ───────────────────────────────
// At the soft quota threshold, cache TTLs are clamped to 50% so a binding
// approaching its command budget refreshes entries more often (cheaper reads
// of shorter-lived data vs. long-lived eviction). 1.0 = unchanged; 0.5 = degraded.
// For v1 this is one-way: once clamped it stays at 50% until the hard limit
// (NullCacheProvider swap) or a manual reset — see risks in sweep_sprints1_2.md.
let _ttlMultiplier = 1.0;
let _cacheTtlClamped = false;

/** Current cache TTL multiplier (1.0 = full TTL, 0.5 = degraded/clamped). */
export function getTtlMultiplier(): number {
    return _ttlMultiplier;
}

// ── Cache effectiveness counters (Sprint 3C) ──────────────────────────────
// Incremented by the cache Proxy when a `get` resolves to a value (hit) or
// null/undefined (miss). Surfaced via /api/health → resilience.cacheStats so
// operators can verify the ~99% hit-rate goal for published pages under load.
let _cacheHits = 0;
let _cacheMisses = 0;

export function recordCacheHit(): void {
    _cacheHits++;
}

export function recordCacheMiss(): void {
    _cacheMisses++;
}

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
        // Sweep Gap 3: clamp TTLs to 50% once the soft threshold is crossed.
        if (!_cacheTtlClamped) {
            _cacheTtlClamped = true;
            _ttlMultiplier = 0.5;
            console.warn('[Resilience] cache TTL clamped to 50% (soft quota threshold)');
        }
        markComponent('cache', 'degraded', `approaching quota (~${_cacheOps} ops)`);
    }
}

/** Test-only: reset counters + state. */
export function _resetResilienceForTests(): void {
    _dbOps = 0;
    _cacheOps = 0;
    _dbDowngraded = false;
    _cacheDowngraded = false;
    _ttlMultiplier = 1.0;
    _cacheTtlClamped = false;
    _cacheHits = 0;
    _cacheMisses = 0;
    _state = { stateDb: { level: 'ok' }, cache: { level: 'ok' } };
}

/** Test-only: override the parsed limits (Infinity = no enforcement). */
export function _setLimitsForTests(db?: Limits, cache?: Limits): void {
    if (db) DB_LIMITS = db;
    if (cache) CACHE_LIMITS = cache;
}
