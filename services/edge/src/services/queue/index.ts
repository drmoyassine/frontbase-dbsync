import { QueueService, QueueOpts, JobHandler } from './types.js';
import { BullMQProvider } from './bullmq-provider.js';
import { QStashProvider } from './qstash-provider.js';

class NoopProvider implements QueueService {
  async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
    console.warn(`[Queue] No queue configured, dropped job: ${jobName}`);
    return "noop-id";
  }
  process(jobName: string, handler: JobHandler): void {
    console.warn(`[Queue] No queue configured, ignored process attempt for: ${jobName}`);
  }
}

export function createQueueService(): QueueService {
  if (process.env.BULLMQ_REDIS_URL) return new BullMQProvider();
  if (process.env.QSTASH_TOKEN) return new QStashProvider();
  return new NoopProvider();
}

export const queueService = createQueueService();
