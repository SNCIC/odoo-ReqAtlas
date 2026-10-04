import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { JobHandler, QueueAdapter, QueueWorkerHandle } from './queue-adapter';

export interface BullMqAdapterOptions {
  connection: ConnectionOptions;
  concurrency?: number;
}

/**
 * BullMQ 实现。
 *
 * 重要：`new Worker(...)` 会立即尝试连接 Redis，因此只在 `createWorker` 被调用
 * （即 `WorkerRuntime.start()`）时才构造。导入本模块本身不会建立任何连接。
 */
export class BullMqQueueAdapter implements QueueAdapter {
  private readonly connection: ConnectionOptions;
  private readonly concurrency: number;

  constructor(options: BullMqAdapterOptions) {
    this.connection = options.connection;
    this.concurrency = options.concurrency ?? 1;
  }

  createWorker(queueName: string, handler: JobHandler): QueueWorkerHandle {
    const worker = new Worker(
      queueName,
      async (job: Job): Promise<void> => {
        await handler({
          id: job.id ?? '',
          name: job.name,
          data: job.data as unknown,
          attemptsMade: job.attemptsMade,
        });
      },
      { connection: this.connection, concurrency: this.concurrency },
    );

    return { close: () => worker.close() };
  }
}

/** 从环境变量构造 Redis 连接参数（不建立连接）。 */
export function connectionFromEnv(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const password = env.REDIS_PASSWORD;
  return {
    host: env.REDIS_HOST ?? 'localhost',
    port: Number(env.REDIS_PORT ?? 6379),
    password: password && password.length > 0 ? password : undefined,
    maxRetriesPerRequest: null,
  };
}
