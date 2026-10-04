import type { JobProcessor } from '../runtime/worker-runtime';

export interface EchoJobData {
  message: string;
}

/**
 * 占位处理器：M1 仅用于证明 worker 可启动、可分发、可失败。
 * 真正的文档/解析/索引/Agent 处理器在后续里程碑注入。
 */
export function createEchoProcessor(): JobProcessor {
  return async (job): Promise<void> => {
    const data = job.data as Partial<EchoJobData> | null | undefined;
    if (!data || typeof data.message !== 'string') {
      throw new Error('echo processor: job.data.message must be a string');
    }
  };
}
