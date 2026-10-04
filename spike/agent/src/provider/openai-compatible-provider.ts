import {
  estimateMessagesTokens,
  estimateTokens,
  type ModelResult,
  type ProviderAdapter,
  type ProviderRequest,
} from './types';

/**
 * OpenAI 兼容 Provider（默认禁用）。
 *
 * 配置全部来自环境变量；未显式开启（`REQATLAS_AGENT_PROVIDER=openai`）时 `enabled=false`，
 * `complete` 直接拒绝，**绝不发网络请求**。真实联网调用在有外网凭据的环境才可能发生；
 * 本仓库无外网模型凭据，故联网路径在自动化测试中**不被调用**。
 */

export interface OpenAICompatibleConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName: string;
  timeoutMs: number;
}

export const PROVIDER_ENV = {
  mode: 'REQATLAS_AGENT_PROVIDER',
  baseUrl: 'REQATLAS_AGENT_BASE_URL',
  apiKey: 'REQATLAS_AGENT_API_KEY',
  model: 'REQATLAS_AGENT_MODEL',
  timeoutMs: 'REQATLAS_AGENT_TIMEOUT_MS',
} as const;

/** 从环境变量读取配置；缺省即禁用（安全默认）。 */
export function readOpenAICompatibleConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenAICompatibleConfig {
  const mode = env[PROVIDER_ENV.mode]?.trim().toLowerCase();
  const timeoutRaw = Number.parseInt(env[PROVIDER_ENV.timeoutMs] ?? '', 10);
  return {
    enabled: mode === 'openai',
    baseUrl: (env[PROVIDER_ENV.baseUrl] ?? '').replace(/\/+$/, ''),
    apiKey: env[PROVIDER_ENV.apiKey] ?? '',
    model: env[PROVIDER_ENV.model] ?? 'gpt-4o-mini',
    providerName: 'openai-compatible',
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30_000,
  };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly name: string;
  private readonly config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    this.config = config;
    this.name = config.providerName;
  }

  /** 三重门禁：显式开启 + baseUrl + apiKey 全部具备才可用。 */
  get enabled(): boolean {
    return this.config.enabled && this.config.baseUrl.length > 0 && this.config.apiKey.length > 0;
  }

  async complete(request: ProviderRequest): Promise<ModelResult> {
    const started = Date.now();
    const base: Omit<ModelResult, 'ok' | 'raw'> = {
      provider: this.name,
      model: this.config.model,
      usage: { inputTokens: estimateMessagesTokens(request.messages), outputTokens: 0 },
      latencyMs: 0,
    };
    if (!this.enabled) {
      return {
        ...base,
        ok: false,
        raw: '',
        latencyMs: Date.now() - started,
        error: {
          code: 'PROVIDER_DISABLED',
          message: '外部模型未启用（REQATLAS_AGENT_PROVIDER != openai 或缺少 baseUrl/apiKey）。',
        },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const onExternalAbort = (): void => controller.abort();
    request.signal?.addEventListener('abort', onExternalAbort, { once: true });
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ...base,
          ok: false,
          raw: '',
          latencyMs: Date.now() - started,
          error: { code: 'PROVIDER_ERROR', message: `HTTP ${response.status}` },
        };
      }
      const json = (await response.json()) as ChatCompletionResponse;
      const raw = json.choices?.[0]?.message?.content ?? '';
      return {
        ...base,
        ok: true,
        raw,
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? estimateMessagesTokens(request.messages),
          outputTokens: json.usage?.completion_tokens ?? estimateTokens(raw),
        },
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        ...base,
        ok: false,
        raw: '',
        latencyMs: Date.now() - started,
        error: {
          code: isAbort ? 'CANCELLED' : 'DEPENDENCY_UNAVAILABLE',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * 默认 Provider：**缺省禁用外部模型**。
 * - `REQATLAS_AGENT_PROVIDER=openai` → OpenAICompatibleProvider（仍需 baseUrl/apiKey）；
 * - 其它/未设置 → DisabledProvider（不访问网络），保证「可完全关闭外部模型」。
 */
export function createDefaultProvider(env: NodeJS.ProcessEnv = process.env): ProviderAdapter {
  return new OpenAICompatibleProvider(readOpenAICompatibleConfig(env));
}
