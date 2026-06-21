/**
 * Queue Service Factory
 *
 * Two strategies, completely decoupled:
 *   - QStash  → cloud edges (CF, Vercel, Deno) — pure HTTP, no deps
 *   - BullMQ  → Docker self-host only — loaded dynamically at runtime
 *              from node_modules (NOT bundled by tsup)
 *
 * The factory checks env vars to decide. If neither is set, falls back
 * to a silent NoopProvider so the edge boots cleanly everywhere.
 */
import { QueueService, QueueOpts, JobHandler, ScheduleOpts, ScheduleHandle } from './types.js';
import { QStashProvider } from './qstash-provider.js';

// ── Noop fallback ──────────────────────────────────────────────────
class NoopProvider implements QueueService {
  async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
    console.warn(`[Queue] No queue configured, dropped job: ${jobName}`);
    return "noop-id";
  }
  process(jobName: string, handler: JobHandler): void {
    console.warn(`[Queue] No queue configured, ignored process attempt for: ${jobName}`);
  }
  getHandler(jobName: string): JobHandler | undefined {
    return undefined; // No handlers in noop mode
  }
  async schedule(jobName: string, data: any, opts: ScheduleOpts): Promise<ScheduleHandle> {
    throw new Error(`[Queue] No scheduler configured — cannot schedule ${jobName} (set QSTASH_TOKEN or BULLMQ_REDIS_URL)`);
  }
  async unschedule(_scheduleId: string): Promise<void> {
    // nothing
  }
}

// ── Dynamic BullMQ loader (Docker runtime only) ────────────────────
// bullmq is NOT in the tsup bundle. It's installed as a regular
// node_modules dep in the Docker image and resolved at runtime.
async function createBullMQProvider(): Promise<QueueService> {
  try {
    // @ts-ignore - bullmq is only installed in the docker container
    const { Queue, Worker } = await import('bullmq');

    const parseRedisUrl = () => {
      const url = new URL(process.env.BULLMQ_REDIS_URL || 'redis://localhost:6379');
      return { host: url.hostname, port: url.port ? parseInt(url.port) : 6379 };
    };

    const queues = new Map<string, InstanceType<typeof Queue>>();
    const workers = new Map<string, InstanceType<typeof Worker>>();
    const bullmqHandlers = new Map<string, JobHandler>();

    return {
      async enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string> {
        if (!queues.has(jobName)) {
          queues.set(jobName, new Queue(jobName, { connection: parseRedisUrl() }));
        }
        const job = await queues.get(jobName)!.add(jobName, data, {
          delay: opts?.delay,
          attempts: opts?.retries,
          priority: opts?.priority,
        });
        return job.id!;
      },
      process(jobName: string, handler: JobHandler): void {
        if (workers.has(jobName)) return;
        bullmqHandlers.set(jobName, handler);
        const worker = new Worker(jobName, async (job: any) => {
          await handler(job.data);
        }, { connection: parseRedisUrl() });
        workers.set(jobName, worker);
      },
      getHandler(jobName: string): JobHandler | undefined {
        return bullmqHandlers.get(jobName);
      },
      async schedule(jobName: string, data: any, opts: ScheduleOpts): Promise<ScheduleHandle> {
        if (!queues.has(jobName)) {
          queues.set(jobName, new Queue(jobName, { connection: parseRedisUrl() }));
        }
        const repeat = opts.cron ? { pattern: opts.cron } : opts.everyMs ? { every: opts.everyMs } : null;
        if (!repeat) throw new Error('BullMQProvider.schedule: cron or everyMs required');
        const job = await queues.get(jobName)!.add(jobName, data, { repeat });
        // BullMQ repeatable id is encoded as "<jobName>:repeat:<key>"; use job.id.
        return { scheduleId: String(job.id!), jobName };
      },
      async unschedule(scheduleId: string): Promise<void> {
        // Repeatable jobs are removed via the queue's removeRepeatable by repeat key.
        // The scheduleId we stored is the BullMQ job id; the repeat key is derived
        // from the queue name. Best-effort removal across known queues.
        for (const q of queues.values()) {
          try {
            const repeatables: any = await (q as any).getRepeatableJobs();
            for (const r of repeatables) {
              if (r.id === scheduleId || r.key === scheduleId) {
                await (q as any).removeRepeatableByKey(r.key);
              }
            }
          } catch {
            // ignore — best effort
          }
        }
      },
    };
  } catch (e) {
    console.warn('[Queue] bullmq not available — falling back to NoopProvider');
    return new NoopProvider();
  }
}

// ── Factory ────────────────────────────────────────────────────────
export async function createQueueService(): Promise<QueueService> {
  if (process.env.BULLMQ_REDIS_URL) return createBullMQProvider();
  if (process.env.QSTASH_TOKEN) return new QStashProvider();
  return new NoopProvider();
}

// Eagerly initialize — the promise resolves once the provider is ready
export const queueServiceReady: Promise<QueueService> = createQueueService();
