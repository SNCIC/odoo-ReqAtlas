/**
 * 队列适配器契约。真实实现（BullMQ）与测试用 fake 共享此接口，
 * 保证在不连接 Redis 的情况下也能对 worker 运行时做单测。
 */

export interface JobContext<TData = unknown> {
  id: string;
  name: string;
  data: TData;
  attemptsMade: number;
}

export type JobHandler<TData = unknown> = (job: JobContext<TData>) => Promise<void>;

export interface QueueWorkerHandle {
  close(): Promise<void>;
}

export interface QueueAdapter {
  createWorker(queueName: string, handler: JobHandler): QueueWorkerHandle;
}
