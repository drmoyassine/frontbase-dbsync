import { Client } from '@upstash/qstash';
import { QueueService, QueueOpts, JobHandler, ScheduleOpts, ScheduleHandle } from './types.js';

export class QStashProvider implements QueueService {
  private client: Client;
  private handlers: Map<string, JobHandler> = new Map();

  constructor() {
    this.client = new Client({ token: process.env.QSTASH_TOKEN! });
  }

  private destinationFor(jobName: string): string {
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
    return `${baseUrl}/api/queue/process?jobName=${encodeURIComponent(jobName)}`;
  }

  async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
    // Convert MS delay to '1d', '2h' etc since QStash 'delay' string is restricted
    // but here we can just use notBefore in absolute seconds.
    const notBefore = opts?.delay ? Math.floor(Date.now() / 1000) + Math.floor(opts.delay / 1000) : undefined;

    const res = await this.client.publishJSON({
      url: this.destinationFor(jobName),
      body: data,
      retries: opts?.retries,
      notBefore,
    });
    return res.messageId;
  }

  async schedule(jobName: string, data: any, opts: ScheduleOpts): Promise<ScheduleHandle> {
    let cron = opts.cron;
    if (!cron && opts.everyMs) {
      // QStash cron granularity is ≥ 1 minute; floor the interval.
      const minutes = Math.max(1, Math.ceil(opts.everyMs / 60000));
      cron = `*/${minutes} * * * *`;
    }
    if (!cron) throw new Error('QStashProvider.schedule: cron or everyMs required');

    // QStash schedules POST to a destination on the cron. The body carries `data`.
    const created: any = await (this.client as any).schedules.create({
      destination: this.destinationFor(jobName),
      cron,
      ...(data && Object.keys(data).length ? { body: JSON.stringify(data) } : {}),
    });
    const scheduleId = created?.scheduleId || created?.id || String(created);
    return { scheduleId, jobName };
  }

  async unschedule(scheduleId: string): Promise<void> {
    await (this.client as any).schedules.delete(scheduleId);
  }

  process(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
  }

  getHandler(jobName: string): JobHandler | undefined {
    return this.handlers.get(jobName);
  }
}
