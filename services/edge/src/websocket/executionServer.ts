/**
 * Execution Event Hub (Automations A12)
 *
 * Transport-agnostic pub/sub for workflow-execution events. Any real-time
 * transport (SSE on Node, WebSocket on Bun/CF Durable Objects) subscribes here;
 * the runtime broadcasts progress here after each node.
 *
 * Design:
 *   - In-memory subscriber map keyed by executionId.
 *   - Ring buffer (per execution) so late subscribers replay recent events.
 *   - No external deps → works on Node / Bun / CF Workers.
 */

import { stateProvider } from '../storage/index.js';

export interface ExecutionEvent {
    type:
        | 'started'
        | 'executing'
        | 'node_completed'
        | 'node_error'
        | 'completed'
        | 'error'
        | 'waiting';
    executionId: string;
    workflowId: string;
    timestamp: string;
    data?: any;
}

type Subscriber = (event: ExecutionEvent) => void;

const MAX_BUFFER = 100;

class ExecutionEventHub {
    private subscribers = new Map<string, Set<Subscriber>>();
    private buffer = new Map<string, ExecutionEvent[]>();

    /**
     * Subscribe to events for an execution. Returns an unsubscribe function.
     */
    subscribe(executionId: string, cb: Subscriber): () => void {
        let set = this.subscribers.get(executionId);
        if (!set) {
            set = new Set();
            this.subscribers.set(executionId, set);
        }
        set.add(cb);
        return () => {
            const s = this.subscribers.get(executionId);
            if (!s) return;
            s.delete(cb);
            if (s.size === 0) this.subscribers.delete(executionId);
        };
    }

    /**
     * Broadcast an event to all subscribers for that execution, buffering it.
     */
    broadcast(event: ExecutionEvent): void {
        const buf = this.buffer.get(event.executionId) || [];
        buf.push(event);
        if (buf.length > MAX_BUFFER) buf.shift();
        this.buffer.set(event.executionId, buf);

        const subs = this.subscribers.get(event.executionId);
        if (!subs) return;
        for (const cb of subs) {
            try {
                cb(event);
            } catch (err) {
                console.error('[EventHub] subscriber threw:', err);
            }
        }
    }

    /**
     * Return buffered events for an execution (for late-subscriber replay).
     */
    getBuffered(executionId: string): ExecutionEvent[] {
        return this.buffer.get(executionId) || [];
    }

    /**
     * Drop subscribers + buffer for an execution (on completion / cleanup).
     */
    cleanup(executionId: string): void {
        this.subscribers.delete(executionId);
        this.buffer.delete(executionId);
    }

    /**
     * Fetch the persisted execution state (for initial snapshot on connect).
     */
    async getInitialState(executionId: string, tenantSlug?: string): Promise<any> {
        const execution = await stateProvider.getExecutionById(executionId, tenantSlug);
        if (!execution) return { error: 'Execution not found' };
        return {
            executionId: execution.id,
            workflowId: execution.workflowId,
            status: execution.status,
            nodeExecutions: execution.nodeExecutions ? safeParse(execution.nodeExecutions) : [],
            result: execution.result ? safeParse(execution.result) : null,
            error: execution.error,
            startedAt: execution.startedAt,
            endedAt: execution.endedAt,
        };
    }

    /** Stats (observability). */
    getStats(): { activeSubscriptions: number; bufferedExecutions: number } {
        return {
            activeSubscriptions: this.subscribers.size,
            bufferedExecutions: this.buffer.size,
        };
    }
}

function safeParse(s: string): any {
    try {
        return JSON.parse(s);
    } catch {
        return s;
    }
}

// Global singleton
let globalHub: ExecutionEventHub | null = null;

export function getExecutionEventHub(): ExecutionEventHub {
    if (!globalHub) globalHub = new ExecutionEventHub();
    return globalHub;
}

/** Broadcast an execution event (convenience). */
export function broadcastExecutionEvent(event: ExecutionEvent): void {
    getExecutionEventHub().broadcast(event);
}

/** Build a typed execution event. */
export function createExecutionEvent(
    type: ExecutionEvent['type'],
    executionId: string,
    workflowId: string,
    data?: any,
): ExecutionEvent {
    return {
        type,
        executionId,
        workflowId,
        timestamp: new Date().toISOString(),
        data,
    };
}
