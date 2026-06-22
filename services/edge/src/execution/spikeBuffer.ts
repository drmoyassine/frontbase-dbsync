/**
 * Spike Leveling Buffer (Automations A7)
 *
 * Leaky-bucket concurrency limiter for workflow executions. Prevents resource
 * exhaustion during traffic spikes by capping the number of concurrent runs and
 * queuing the rest (with an optional timeout).
 *
 * Configurable via WORKFLOW_MAX_CONCURRENT. The default of 10 is a safe
 * conservative ceiling for a single edge isolate.
 */

export interface SpikeBufferConfig {
    maxConcurrent: number;
    /** Max time to wait in the queue (ms). 0 = wait forever. */
    queueTimeout?: number;
}

interface QueuedTask<T> {
    job: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timeout?: ReturnType<typeof setTimeout>;
}

export class SpikeBuffer {
    private queue: QueuedTask<any>[] = [];
    private processing = 0;
    private readonly config: Required<Pick<SpikeBufferConfig, 'maxConcurrent'>> &
        Pick<SpikeBufferConfig, 'queueTimeout'>;

    constructor(config?: Partial<SpikeBufferConfig>) {
        this.config = {
            maxConcurrent:
                config?.maxConcurrent ??
                parseInt(process.env.WORKFLOW_MAX_CONCURRENT || '10', 10),
            queueTimeout: config?.queueTimeout ?? 300000, // 5 minutes default
        };
    }

    /**
     * Execute a job with spike leveling.
     */
    async execute<T>(job: () => Promise<T>): Promise<T> {
        if (this.processing < this.config.maxConcurrent) {
            return this.runJob(job);
        }

        return new Promise<T>((resolve, reject) => {
            const task: QueuedTask<T> = { job, resolve, reject };
            if (this.config.queueTimeout && this.config.queueTimeout > 0) {
                task.timeout = setTimeout(() => {
                    const idx = this.queue.indexOf(task);
                    if (idx >= 0) this.queue.splice(idx, 1);
                    reject(new Error('Workflow execution timed out in queue'));
                }, this.config.queueTimeout);
            }
            this.queue.push(task as QueuedTask<any>);
        });
    }

    private async runJob<T>(job: () => Promise<T>): Promise<T> {
        this.processing++;
        try {
            return await job();
        } finally {
            this.processing--;
            this.processNext();
        }
    }

    private processNext(): void {
        if (this.queue.length === 0 || this.processing >= this.config.maxConcurrent) {
            return;
        }
        const task = this.queue.shift();
        if (!task) return;
        if (task.timeout) clearTimeout(task.timeout);
        this.runJob(task.job).then(task.resolve).catch(task.reject);
    }

    /**
     * Current buffer stats.
     */
    getStats(): { processing: number; queued: number; capacity: number } {
        return {
            processing: this.processing,
            queued: this.queue.length,
            capacity: this.config.maxConcurrent,
        };
    }

    /**
     * Shutdown: reject all queued tasks (for tests / graceful stop).
     */
    shutdown(): void {
        const drained = this.queue.splice(0);
        for (const task of drained) {
            if (task.timeout) clearTimeout(task.timeout);
            task.reject(new Error('Spike buffer shutdown'));
        }
    }
}

// Global singleton
let globalBuffer: SpikeBuffer | null = null;

export function getWorkflowSpikeBuffer(): SpikeBuffer {
    if (!globalBuffer) {
        globalBuffer = new SpikeBuffer();
    }
    return globalBuffer;
}

/** Reset the global buffer (for tests). */
export function resetWorkflowSpikeBuffer(): void {
    if (globalBuffer) {
        globalBuffer.shutdown();
        globalBuffer = null;
    }
}
