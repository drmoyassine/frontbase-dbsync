import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        getExecutionById: vi.fn(),
    },
}));

import {
    getExecutionEventHub,
    broadcastExecutionEvent,
    createExecutionEvent,
} from '../websocket/executionServer.js';

describe('Execution Event Hub', () => {
    beforeEach(() => {
        // Reset the singleton by re-importing would be ideal; instead just clear
        // state via cleanup of a known id + rely on fresh subscription sets.
    });

    describe('createExecutionEvent', () => {
        it('builds a typed event with a valid timestamp', () => {
            const event = createExecutionEvent('started', 'exec-1', 'wf-1', { x: 1 });
            expect(event.type).toBe('started');
            expect(event.executionId).toBe('exec-1');
            expect(event.workflowId).toBe('wf-1');
            expect(event.data).toEqual({ x: 1 });
            expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
        });
    });

    describe('subscribe + broadcast', () => {
        it('delivers events to subscribers', () => {
            const hub = getExecutionEventHub();
            const received: any[] = [];
            const unsub = hub.subscribe('exec-deliver', (e) => received.push(e));

            hub.broadcast(createExecutionEvent('node_completed', 'exec-deliver', 'wf-1', { nodeId: 'n-1' }));
            hub.broadcast(createExecutionEvent('completed', 'exec-deliver', 'wf-1'));

            expect(received).toHaveLength(2);
            expect(received[0].type).toBe('node_completed');
            expect(received[1].type).toBe('completed');
            unsub();
        });

        it('stops delivering after unsubscribe', () => {
            const hub = getExecutionEventHub();
            const received: any[] = [];
            const unsub = hub.subscribe('exec-unsub', (e) => received.push(e));
            unsub();
            hub.broadcast(createExecutionEvent('completed', 'exec-unsub', 'wf-1'));
            expect(received).toHaveLength(0);
        });

        it('only delivers events for the subscribed execution', () => {
            const hub = getExecutionEventHub();
            const received: any[] = [];
            hub.subscribe('exec-target', (e) => received.push(e));
            hub.broadcast(createExecutionEvent('completed', 'exec-other', 'wf-1'));
            expect(received).toHaveLength(0);
        });

        it('replays buffered events for late subscribers', () => {
            const hub = getExecutionEventHub();
            hub.broadcast(createExecutionEvent('node_completed', 'exec-buffer', 'wf-1'));
            const buffered = hub.getBuffered('exec-buffer');
            expect(buffered.length).toBeGreaterThanOrEqual(1);
            expect(buffered[buffered.length - 1].type).toBe('node_completed');
        });

        it('survives a subscriber that throws', () => {
            const hub = getExecutionEventHub();
            const ok: any[] = [];
            hub.subscribe('exec-throw', () => {
                throw new Error('boom');
            });
            hub.subscribe('exec-throw', (e) => ok.push(e));
            hub.broadcast(createExecutionEvent('completed', 'exec-throw', 'wf-1'));
            expect(ok).toHaveLength(1);
        });
    });

    describe('cleanup', () => {
        it('removes subscribers and buffer', () => {
            const hub = getExecutionEventHub();
            hub.broadcast(createExecutionEvent('node_completed', 'exec-clean', 'wf-1'));
            hub.cleanup('exec-clean');
            expect(hub.getBuffered('exec-clean')).toEqual([]);
        });
    });

    describe('getInitialState', () => {
        it('returns persisted execution state', async () => {
            const { stateProvider } = await import('../storage/index.js');
            (stateProvider.getExecutionById as any).mockResolvedValue({
                id: 'exec-1',
                workflowId: 'wf-1',
                status: 'completed',
                nodeExecutions: JSON.stringify([{ nodeId: 'n-1', status: 'completed' }]),
                result: JSON.stringify({ ok: true }),
                error: null,
                startedAt: '2024-01-01T00:00:00Z',
                endedAt: '2024-01-01T00:00:01Z',
            });

            const hub = getExecutionEventHub();
            const state = await hub.getInitialState('exec-1');
            expect(state.status).toBe('completed');
            expect(state.nodeExecutions).toHaveLength(1);
            expect(state.result).toEqual({ ok: true });
        });

        it('returns an error object when the execution is missing', async () => {
            const { stateProvider } = await import('../storage/index.js');
            (stateProvider.getExecutionById as any).mockResolvedValue(null);
            const hub = getExecutionEventHub();
            const state = await hub.getInitialState('missing');
            expect(state.error).toBeDefined();
        });
    });

    describe('broadcastExecutionEvent (convenience)', () => {
        it('routes through the singleton', () => {
            const hub = getExecutionEventHub();
            const received: any[] = [];
            hub.subscribe('exec-convenience', (e) => received.push(e));
            broadcastExecutionEvent(createExecutionEvent('completed', 'exec-convenience', 'wf-1'));
            expect(received).toHaveLength(1);
        });
    });
});
