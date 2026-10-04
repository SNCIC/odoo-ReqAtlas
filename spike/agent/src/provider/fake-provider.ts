import {
  estimateMessagesTokens,
  estimateTokens,
  sleep,
  type ModelResult,
  type ProviderAdapter,
  type ProviderRequest,
} from './types';

export interface FakeProviderOptions {
  /**
   * 确定性响应函数：给定同一请求必须返回同一字符串（测试会据此断言「同输入同输出」）。
   * 返回的字符串期望是 JSON；测试可故意返回畸形 JSON 以验证 Schema Guard。
   */
  respond: (request: ProviderRequest) => string | Promise<string>;
  /** 人为延迟（毫秒），用于超时/取消用例。 */
  delayMs?: number;
  /** 延迟实现是否响应 AbortSignal（默认 true）。 */
  abortable?: boolean;
  model?: string;
  name?: string;
}

/**
 * 确定性 Fake Provider。
 *
 * - 不访问网络，可在测试中注入**故意畸形的 JSON**；
 * - 相同输入 → 相同输出（由纯 `respond` 保证）；
 * - 支持延迟/中断，覆盖超时与取消。
 */
export class FakeProvider implements ProviderAdapter {
  readonly name: string;
  readonly enabled = true;
  private readonly options: FakeProviderOptions;

  constructor(options: FakeProviderOptions) {
    this.options = options;
    this.name = options.name ?? 'fake';
  }

  async complete(request: ProviderRequest): Promise<ModelResult> {
    const started = Date.now();
    const model = this.options.model ?? 'fake-model-v1';
    try {
      if (this.options.delayMs !== undefined && this.options.delayMs > 0) {
        await sleep(
          this.options.delayMs,
          this.options.abortable === false ? undefined : request.signal,
        );
      }
      const raw = await this.options.respond(request);
      return {
        provider: this.name,
        model,
        ok: true,
        raw,
        usage: {
          inputTokens: estimateMessagesTokens(request.messages),
          outputTokens: estimateTokens(raw),
        },
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        provider: this.name,
        model,
        ok: false,
        raw: '',
        usage: { inputTokens: estimateMessagesTokens(request.messages), outputTokens: 0 },
        latencyMs: Date.now() - started,
        error: {
          code: isAbort ? 'CANCELLED' : 'PROVIDER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
