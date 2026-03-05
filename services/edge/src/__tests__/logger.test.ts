/**
 * Workflow Logger Tests
 *
 * Tests the scoped logger that respects per-workflow log_level setting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWorkflowLogger } from '../engine/logger.js';

describe('createWorkflowLogger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('log_level: all', () => {
        it('outputs info messages', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const log = createWorkflowLogger('all');
            log.info('test info');
            expect(spy).toHaveBeenCalledWith('[Workflow]', 'test info');
        });

        it('outputs error messages', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const log = createWorkflowLogger('all');
            log.error('test error');
            expect(spy).toHaveBeenCalledWith('[Workflow]', 'test error');
        });

        it('outputs warn messages', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const log = createWorkflowLogger('all');
            log.warn('test warn');
            expect(spy).toHaveBeenCalledWith('[Workflow]', 'test warn');
        });
    });

    describe('log_level: errors', () => {
        it('suppresses info messages', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const log = createWorkflowLogger('errors');
            log.info('test info');
            // The logger itself should NOT call console.log for 'errors' level
            expect(spy).not.toHaveBeenCalled();
        });

        it('outputs error messages', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const log = createWorkflowLogger('errors');
            log.error('test error');
            expect(spy).toHaveBeenCalledWith('[Workflow]', 'test error');
        });

        it('outputs warn messages', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const log = createWorkflowLogger('errors');
            log.warn('test warn');
            expect(spy).toHaveBeenCalledWith('[Workflow]', 'test warn');
        });
    });

    describe('log_level: none', () => {
        it('suppresses info messages', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const log = createWorkflowLogger('none');
            log.info('test info');
            expect(spy).not.toHaveBeenCalled();
        });

        it('suppresses error messages', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const log = createWorkflowLogger('none');
            log.error('test error');
            expect(spy).not.toHaveBeenCalled();
        });

        it('suppresses warn messages', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const log = createWorkflowLogger('none');
            log.warn('test warn');
            expect(spy).not.toHaveBeenCalled();
        });
    });

    it('uses custom prefix', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const log = createWorkflowLogger('all', '[Custom]');
        log.info('test');
        expect(spy).toHaveBeenCalledWith('[Custom]', 'test');
    });

    it('defaults to "all" level', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const log = createWorkflowLogger();
        log.info('test');
        expect(spy).toHaveBeenCalled();
    });
});
