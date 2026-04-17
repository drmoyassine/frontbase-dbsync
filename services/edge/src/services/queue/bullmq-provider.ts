/**
 * BullMQ Queue Provider — Docker/self-host only.
 *
 * Uses dynamic import() so the bundler never statically resolves 'bullmq'.
 * Cloud edge builds (CF, Vercel, Deno) will never execute this path
 * because the factory in index.ts only instantiates BullMQProvider
 * when BULLMQ_REDIS_URL is set — which it never is on serverless edges.
 */
import { QueueService, QueueOpts, JobHandler } from './types.js';

// Lazy-loaded references — populated on first use
let _Queue: any = null;
let _Worker: any = null;

async function loadBullMQ() {
  if (!_Queue) {
    const mod = await import('bullmq');
    _Queue = mod.Queue;
    _Worker = mod.Worker;
  }
  return { Queue: _Queue, Worker: _Worker };
}

function parseRedisUrl(): { host: string; port: number } {
  const url = new URL(process.env.BULLMQ_REDIS_URL || 'redis://localhost:6379');
  return { host: url.hostname, port: url.port ? parseInt(url.port) : 6379 };
}

export class BullMQProvider implements QueueService {
  private queues: Map<string, any> = new Map();
  private workers: Map<string, any> = new Map();

  private async getQueue(name: string) {
    if (!this.queues.has(name)) {
      const { Queue } = await loadBullMQ();
      this.queues.set(name, new Queue(name, { connection: parseRedisUrl() }));
    }
    return this.queues.get(name)!;
  }

  async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
    const queue = await this.getQueue(jobName);
    const job = await queue.add(jobName, data, {
      delay: opts?.delay,
      attempts: opts?.retries,
      priority: opts?.priority,
    });
    return job.id!;
  }

  async process(jobName: string, handler: JobHandler): Promise<void> {
    if (this.workers.has(jobName)) return;

    const { Worker } = await loadBullMQ();
    const worker = new Worker(jobName, async (job: any) => {
      await handler(job.data);
    }, {
      connection: parseRedisUrl(),
    });

    this.workers.set(jobName, worker);
  }
}
