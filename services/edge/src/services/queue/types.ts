export interface QueueOpts {
  delay?: number;
  retries?: number;
  priority?: number;
}

export type JobHandler = (data: any) => Promise<void>;

export interface QueueService {
  enqueue(jobName: string, data: any, opts?: QueueOpts): Promise<string>;
  process(jobName: string, handler: JobHandler): void;
}
