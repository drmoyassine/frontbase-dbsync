import { describe, it, expect, beforeEach } from 'vitest';
import {
    getResilienceState,
    markComponent,
    recordStateDbOp,
    recordCacheOp,
    registerDowngraders,
    _resetResilienceForTests,
    _setLimitsForTests,
} from '../resilience.js';

beforeEach(() => {
    _resetResilienceForTests();
    _setLimitsForTests({ soft: Infinity, hard: Infinity }, { soft: Infinity, hard: Infinity });
});

describe('resilience state machine (Sprint 2D)', () => {
    it('starts ok and reflects markComponent transitions', () => {
        expect(getResilienceState().cache.level).toBe('ok');
        markComponent('cache', 'degraded', 'slow');
        expect(getResilienceState().cache.level).toBe('degraded');
        expect(getResilienceState().cache.reason).toBe('slow');
        expect(getResilienceState().cache.since).toBeTruthy();
    });

    it('is a no-op when level and reason are unchanged', () => {
        markComponent('stateDb', 'down', 'x');
        const first = getResilienceState().stateDb.since;
        markComponent('stateDb', 'down', 'x'); // same → no change
        expect(getResilienceState().stateDb.since).toBe(first);
    });
});

describe('quota guards (Sprint 2B/2C)', () => {
    it('is inert when no limits are configured (default)', () => {
        for (let i = 0; i < 1000; i++) recordCacheOp();
        expect(getResilienceState().cache.level).toBe('ok');
    });

    it('marks degraded at the soft threshold', () => {
        _setLimitsForTests(undefined, { soft: 8, hard: 100 });
        for (let i = 0; i < 8; i++) recordCacheOp();
        expect(getResilienceState().cache.level).toBe('degraded');
    });

    it('triggers the downgrade callback exactly once at the hard limit', () => {
        _setLimitsForTests(undefined, { soft: 4, hard: 10 });
        let downgrades = 0;
        registerDowngraders({ cache: () => { downgrades++; } });
        for (let i = 0; i < 10; i++) recordCacheOp();
        expect(getResilienceState().cache.level).toBe('down');
        expect(downgrades).toBe(1);
        // further ops must not re-trigger
        for (let i = 0; i < 5; i++) recordCacheOp();
        expect(downgrades).toBe(1);
    });

    it('downgrades the state DB at its hard limit', () => {
        _setLimitsForTests({ soft: 4, hard: 10 }, undefined);
        let swapped = false;
        registerDowngraders({ stateDb: () => { swapped = true; } });
        for (let i = 0; i < 10; i++) recordStateDbOp();
        expect(getResilienceState().stateDb.level).toBe('down');
        expect(swapped).toBe(true);
    });
});
