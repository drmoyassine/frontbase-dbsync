import { Queue, Worker } from 'bullmq';
import { QueueService, QueueOpts, JobHandler } from './types.js';

export class BullMQProvider implements QueueService {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const url = new URL(process.env.BULLMQ_REDIS_URL || 'redis://localhost:6379');
      this.queues.set(name, new Queue(name, {
        connection: {
          host: url.hostname,
          port: url.port ? parseInt(url.port) : 6379,
        }
      }));
    }
    return this.queues.get(name)!;
  }

  async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
    const queue = this.getQueue(jobName);
    const job = await queue.add(jobName, data, {
      delay: opts?.delay,
      attempts: opts?.retries,
      priority: opts?.priority,
    });
    return job.id!;
  }

  process(jobName: string, handler: JobHandler): void {
    if (this.workers.has(jobName)) return;

    const url = new URL(process.env.BULLMQ_REDIS_URL || 'redis://localhost:6379');
    const worker = new Worker(jobName, async (job) => {
      await handler(job.data);
    }, {
      connection: {
        host: url.hostname,
        port: url.port ? parseInt(url.port) : 6379,
      }
    });

    this.workers.set(jobName, worker);
  }
}
