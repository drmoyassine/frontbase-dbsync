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
import { QueueService, QueueOpts, JobHandler } from './types.js';
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
        const worker = new Worker(jobName, async (job: any) => {
          await handler(job.data);
        }, { connection: parseRedisUrl() });
        workers.set(jobName, worker);
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
