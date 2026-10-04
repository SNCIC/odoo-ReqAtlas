import { createJsonLogger } from '@reqatlas/observability';
import { describe, expect, it } from 'vitest';
import type {
  JobContext,
  JobHandler,
  QueueAdapter,
  QueueWorkerHandle,
} from '../queue/queue-adapter';
import { WorkerRuntime } from './worker-runtime';

class FakeQueueAdapter implements QueueAdapter {
  public readonly createdQueues: string[] = [];
  public handler?: JobHandler;
  public closed = false;

  createWorker(queueName: string, handler: JobHandler): QueueWorkerHandle {
    this.createdQueues.push(queueName);
    this.handler = handler;
    return {
      close: async (): Promise<void> => {
        this.closed = true;
      },
    };
  }
}

function silentLogger() {
  return createJsonLogger({ service: 'worker-test', level: 'debug', sink: () => undefined });
}

const job: JobContext = { id: '1', name: 'echo', data: { message: 'hi' }, attemptsMade: 0 };

describe('WorkerRuntime (no Redis)', () => {
  it('start() 通过适配器创建 worker，无需连接 Redis', () => {
    const adapter = new FakeQueueAdapter();
    const runtime = new WorkerRuntime(adapter, {
      queueName: 'q1',
      processor: async () => undefined,
      logger: silentLogger(),
    });

    runtime.start();

    expect(adapter.createdQueues).toEqual(['q1']);
    expect(adapter.handler).toBeTypeOf('function');
  });

  it('处理器按 job 分发并被调用', async () => {
    const adapter = new FakeQueueAdapter();
    const seen: string[] = [];
    const runtime = new WorkerRuntime(adapter, {
      queueName: 'q1',
      processor: async (j) => {
        seen.push(j.id);
      },
      logger: silentLogger(),
    });

    runtime.start();
    await adapter.handler?.(job);

    expect(seen).toEqual(['1']);
  });

  it('处理器抛错时向上传递，便于 BullMQ 重试', async () => {
    const adapter = new FakeQueueAdapter();
    const runtime = new WorkerRuntime(adapter, {
      queueName: 'q1',
      processor: async () => {
        throw new Error('boom');
      },
      logger: silentLogger(),
    });

    runtime.start();

    await expect(adapter.handler?.(job)).rejects.toThrow('boom');
  });

  it('stop() 关闭 worker，可重复调用（幂等）', async () => {
    const adapter = new FakeQueueAdapter();
    const runtime = new WorkerRuntime(adapter, {
      queueName: 'q1',
      processor: async () => undefined,
      logger: silentLogger(),
    });

    runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(adapter.closed).toBe(true);
  });
});
