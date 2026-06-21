/**
 * Phase 0 — query-dispatch tests.
 *
 * Guards the no-behavior-change guarantee: legacy direct/proxy requests must
 * keep resolving to the existing path; only explicit contract modes route to
 * the new dispatcher.
 */

import { describe, it, expect } from 'vitest';
import { resolveQueryMode, isNewMode } from '../engine/queryDispatch';

describe('resolveQueryMode', () => {
    it('maps legacy direct → direct-rpc', () => {
        expect(resolveQueryMode({ fetchStrategy: 'direct' })).toBe('direct-rpc');
    });

    it('maps legacy proxy → legacy', () => {
        expect(resolveQueryMode({ fetchStrategy: 'proxy', datasourceId: 'ds-1' })).toBe('legacy');
    });

    it('defaults to legacy when nothing is set', () => {
        expect(resolveQueryMode({})).toBe('legacy');
    });

    it('honors an explicit queryConfig.mode', () => {
        expect(resolveQueryMode({ queryConfig: { mode: 'proxy-http' } })).toBe('proxy-http');
        expect(resolveQueryMode({ queryConfig: { mode: 'proxy-rpc' } })).toBe('proxy-rpc');
        expect(resolveQueryMode({ queryConfig: { mode: 'proxy-sql' } })).toBe('proxy-sql');
        expect(resolveQueryMode({ queryConfig: { mode: 'direct-rpc' } })).toBe('direct-rpc');
    });

    it('ignores unknown mode values (falls back to strategy mapping)', () => {
        expect(resolveQueryMode({ queryConfig: { mode: 'nonsense' }, fetchStrategy: 'direct' })).toBe('direct-rpc');
        expect(resolveQueryMode({ queryConfig: { mode: 'nonsense' } })).toBe('legacy');
    });
});

describe('isNewMode', () => {
    it('is true only for proxy-rpc/proxy-sql/proxy-http', () => {
        expect(isNewMode({ queryConfig: { mode: 'proxy-http' } })).toBe(true);
        expect(isNewMode({ queryConfig: { mode: 'proxy-rpc' } })).toBe(true);
        expect(isNewMode({ queryConfig: { mode: 'proxy-sql' } })).toBe(true);
    });

    it('is false for legacy direct/proxy (Supabase path unchanged)', () => {
        expect(isNewMode({ fetchStrategy: 'direct' })).toBe(false);
        expect(isNewMode({ fetchStrategy: 'proxy', datasourceId: 'ds-1' })).toBe(false);
        expect(isNewMode({})).toBe(false);
    });

    it('is false for explicit direct-rpc', () => {
        expect(isNewMode({ queryConfig: { mode: 'direct-rpc' } })).toBe(false);
    });
});
