import { createJsonLogger } from '@reqatlas/observability';
import { BullMqQueueAdapter, connectionFromEnv } from './queue/bullmq-queue.adapter';
import { createEchoProcessor } from './processors/echo.processor';
import { WorkerRuntime } from './runtime/worker-runtime';

const QUEUE_NAME = process.env.WORKER_QUEUE ?? 'reqatlas-default';

async function main(): Promise<void> {
  const logger = createJsonLogger({
    service: 'worker',
    level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined) ?? 'info',
  });

  const adapter = new BullMqQueueAdapter({
    connection: connectionFromEnv(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  });

  const runtime = new WorkerRuntime(adapter, {
    queueName: QUEUE_NAME,
    processor: createEchoProcessor(),
    logger,
    service: 'worker',
  });

  runtime.start();
  process.stdout.write(`@reqatlas/worker started (queue=${QUEUE_NAME})\n`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('worker_shutdown', { signal });
    await runtime.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void main();
