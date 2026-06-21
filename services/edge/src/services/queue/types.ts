export interface QueueOpts {
  delay?: number;
  retries?: number;
  priority?: number;
}

export type JobHandler = (data: any) => Promise<void>;

/** Options for a recurring schedule. Exactly one of `cron` / `everyMs` is set. */
export interface ScheduleOpts {
  /** Standard 5-field cron expression (QStash granularity ≥ 1 minute). */
  cron?: string;
  /** Fixed interval in milliseconds (BullMQ only supports sub-minute). */
  everyMs?: number;
}

/** Result of creating a schedule — `scheduleId` is needed to unschedule later. */
export interface ScheduleHandle {
  scheduleId: string;
  jobName: string;
}

export interface QueueService {
  enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string>;
  process(jobName: string, handler: JobHandler): void;
  /** Look up a registered handler by job name (for /api/queue/process). */
  getHandler?(jobName: string): JobHandler | undefined;

  /**
   * Register a recurring schedule. The provider pings the job's handler on the
   * cadence. Returns a handle whose `scheduleId` must be persisted for teardown.
   * Throws if neither `cron` nor `everyMs` is provided.
   */
  schedule?(jobName: string, data: any, opts: ScheduleOpts): Promise<ScheduleHandle>;
  /** Remove a previously-created schedule by its id. */
  unschedule?(scheduleId: string): Promise<void>;
}
