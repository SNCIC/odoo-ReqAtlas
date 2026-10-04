import { createJsonLogger, type Logger } from '@reqatlas/observability';
import type { JobContext, QueueAdapter, QueueWorkerHandle } from '../queue/queue-adapter';

export type JobProcessor = (job: JobContext) => Promise<void>;

export interface WorkerRuntimeOptions {
  queueName: string;
  processor: JobProcessor;
  logger?: Logger;
  service?: string;
}

/**
 * 队列无关的 worker 运行时：负责启动、分发、日志、优雅关闭。
 * 通过注入 `QueueAdapter` 与 Redis 解耦，测试可用 fake 适配器。
 */
export class WorkerRuntime {
  private handle?: QueueWorkerHandle;
  private readonly logger: Logger;
  private readonly adapter: QueueAdapter;
  private readonly options: WorkerRuntimeOptions;

  constructor(adapter: QueueAdapter, options: WorkerRuntimeOptions) {
    this.adapter = adapter;
    this.options = options;
    this.logger = options.logger ?? createJsonLogger({ service: options.service ?? 'worker' });
  }

  start(): void {
    if (this.handle) {
      return;
    }
    this.logger.info('worker_starting', { queue: this.options.queueName });
    this.handle = this.adapter.createWorker(this.options.queueName, async (job) => {
      const startedAt = Date.now();
      this.logger.info('job_started', {
        queue: this.options.queueName,
        jobId: job.id,
        jobName: job.name,
      });
      try {
        await this.options.processor(job);
        this.logger.info('job_completed', {
          queue: this.options.queueName,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        this.logger.error('job_failed', {
          queue: this.options.queueName,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
          reason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.handle) {
      return;
    }
    const handle = this.handle;
    this.handle = undefined;
    await handle.close();
    this.logger.info('worker_stopped', { queue: this.options.queueName });
  }
}
