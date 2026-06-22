import { describe, it, expect, afterEach } from 'vitest';
import {
    SpikeBuffer,
    getWorkflowSpikeBuffer,
    resetWorkflowSpikeBuffer,
} from '../execution/spikeBuffer.js';

describe('Spike Buffer', () => {
    afterEach(() => {
        resetWorkflowSpikeBuffer();
    });

    describe('execute', () => {
        it('runs a job immediately when capacity is available', async () => {
            const buffer = new SpikeBuffer({ maxConcurrent: 2 });
            const result = await buffer.execute(async () => 'done');
            expect(result).toBe('done');
        });

        it('queues a job when at capacity and runs it after capacity frees', async () => {
            const buffer = new SpikeBuffer({ maxConcurrent: 1, queueTimeout: 0 });

            let resolveFirst!: (v: string) => void;
            const firstJob = buffer.execute(
                () =>
                    new Promise<string>((resolve) => {
                        resolveFirst = resolve;
                    }),
            );

            const secondJob = buffer.execute(async () => 'second');

            // Second job should not yet be resolved
            let secondResolved = false;
            void secondJob.then(() => {
                secondResolved = true;
            });
            await new Promise((r) => setTimeout(r, 30));
            expect(secondResolved).toBe(false);

            resolveFirst('first');
            await firstJob;
            const secondResult = await secondJob;
            expect(secondResult).toBe('second');
        });

        it('rejects a job when the queue timeout expires', async () => {
            const buffer = new SpikeBuffer({ maxConcurrent: 1, queueTimeout: 50 });

            let resolveFirst!: (v: string) => void;
            const firstJob = buffer.execute(
                () =>
                    new Promise<string>((resolve) => {
                        resolveFirst = resolve;
                    }),
            );

            const secondJob = buffer.execute(async () => 'second');
            await expect(secondJob).rejects.toThrow('timed out in queue');

            resolveFirst('first');
            await firstJob;
        });

        it('reports stats', () => {
            const buffer = new SpikeBuffer({ maxConcurrent: 3 });
            const stats = buffer.getStats();
            expect(stats).toEqual({ processing: 0, queued: 0, capacity: 3 });
        });
    });

    describe('getWorkflowSpikeBuffer', () => {
        it('returns a singleton', () => {
            const a = getWorkflowSpikeBuffer();
            const b = getWorkflowSpikeBuffer();
            expect(a).toBe(b);
        });

        it('respects WORKFLOW_MAX_CONCURRENT', () => {
            process.env.WORKFLOW_MAX_CONCURRENT = '7';
            resetWorkflowSpikeBuffer();
            const buffer = getWorkflowSpikeBuffer();
            expect(buffer.getStats().capacity).toBe(7);
            delete process.env.WORKFLOW_MAX_CONCURRENT;
            resetWorkflowSpikeBuffer();
        });
    });

    describe('shutdown', () => {
        it('rejects queued tasks', async () => {
            const buffer = new SpikeBuffer({ maxConcurrent: 1, queueTimeout: 0 });

            let resolveFirst!: (v: string) => void;
            const firstJob = buffer.execute(
                () =>
                    new Promise<string>((resolve) => {
                        resolveFirst = resolve;
                    }),
            );
            const secondJob = buffer.execute(async () => 'second');

            buffer.shutdown();
            await expect(secondJob).rejects.toThrow('shutdown');

            resolveFirst('first');
            await expect(firstJob).resolves.toBe('first');
        });
    });
});
