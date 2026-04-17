import { Client } from '@upstash/qstash';
import { QueueService, QueueOpts, JobHandler } from './types.js';

export class QStashProvider implements QueueService {
  private client: Client;
  private handlers: Map<string, JobHandler> = new Map();

  constructor() {
    this.client = new Client({ token: process.env.QSTASH_TOKEN! });
  }

  async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
    const url = `${baseUrl}/api/queue/process?jobName=${jobName}`;
    
    // Convert MS delay to '1d', '2h' etc since QStash 'delay' string is restricted
    // but here we can just use notBefore in absolute seconds.
    const notBefore = opts?.delay ? Math.floor(Date.now() / 1000) + Math.floor(opts.delay / 1000) : undefined;
    
    const res = await this.client.publishJSON({
      url,
      body: data,
      retries: opts?.retries,
      notBefore,
    });
    return res.messageId;
  }

  process(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
  }

  getHandler(jobName: string): JobHandler | undefined {
    return this.handlers.get(jobName);
  }
}
