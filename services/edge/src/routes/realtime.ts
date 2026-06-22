/**
 * Execution Real-time Route (Automations A12)
 *
 * Streams workflow-execution events to clients.
 *
 *   GET /sse/:executionId   — Server-Sent Events stream (works on Node / Bun,
 *                              zero extra deps). The primary transport.
 *   GET /ws/:executionId    — WebSocket upgrade. The actual upgrade depends on
 *                              the runtime (Bun: native; Node: needs 'ws';
 *                              CF: Durable Objects). This route documents the
 *                              upgrade contract and serves as the mount point.
 *
 * Both transports read from the shared websocket/executionServer.ts event hub,
 * so whichever is wired receives the same events the runtime broadcasts.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getExecutionEventHub } from '../websocket/executionServer.js';

export const realtimeRoute = new Hono();

// ── SSE stream ──────────────────────────────────────────────────────────────

realtimeRoute.get('/sse/:executionId', (c) =>
    streamSSE(c, async (stream) => {
        const executionId = c.req.param('executionId');
        const tenantSlug = (c.get as any)('tenantSlug') || '_default';
        const hub = getExecutionEventHub();

        // Send an initial snapshot (current persisted state), scoped to tenant.
        const initial = await hub.getInitialState(executionId, tenantSlug);
        await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(initial) });

        // Replay any buffered events (so a late subscriber catches up).
        for (const evt of hub.getBuffered(executionId)) {
            await stream.writeSSE({ event: evt.type, data: JSON.stringify(evt) });
        }

        // Subscribe to live events.
        const queue: any[] = [];
        let resolveNext: ((v: any) => void) | null = null;
        let closed = false;

        const unsubscribe = hub.subscribe(executionId, (event) => {
            queue.push(event);
            if (resolveNext) {
                resolveNext(queue.shift());
                resolveNext = null;
            }
        });

        // Heartbeat keeps the connection alive through proxies.
        const heartbeat = setInterval(() => {
            stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => {});
        }, 15000);

        const nextEvent = (): Promise<any> =>
            new Promise((resolve) => {
                if (queue.length > 0) return resolve(queue.shift());
                resolveNext = resolve;
            });

        try {
            while (!closed) {
                const event = await Promise.race([
                    nextEvent(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
                ]).catch(() => null);

                if (!event) {
                    // Idle tick — keep looping unless the stream is closed.
                    if (stream.aborted) break;
                    continue;
                }

                await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });

                // Terminal events close the stream.
                if (event.type === 'completed' || event.type === 'error') {
                    break;
                }
            }
        } catch (err) {
            console.error('[Realtime SSE] stream error:', err);
        } finally {
            clearInterval(heartbeat);
            unsubscribe();
            try {
                await stream.writeSSE({ event: 'close', data: '{}' });
            } catch {
                /* ignore */
            }
        }
    }),
);

// ── WebSocket upgrade mount point ───────────────────────────────────────────

realtimeRoute.get('/ws/:executionId', (c) => {
    // The actual WS upgrade is runtime-specific. This documents the contract.
    const executionId = c.req.param('executionId');
    if (c.req.header('upgrade') !== 'websocket') {
        return c.json(
            {
                transport: 'websocket',
                executionId,
                hint: 'This endpoint expects a WebSocket upgrade. On runtimes without native WS (Node), use the SSE transport at /api/realtime/sse/:executionId instead.',
            },
            426,
        );
    }
    // On Bun / CF, the platform handles the upgrade; otherwise return a hint.
    return c.json(
        {
            transport: 'websocket',
            executionId,
            hint: 'WebSocket upgrade must be handled by the runtime adapter. Subscribe to the execution event hub via getExecutionEventHub().subscribe().',
        },
        200,
    );
});
