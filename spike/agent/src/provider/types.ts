/** Provider 消息（最小上下文构造产物）。 */
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 发往 Provider 的候选对象摘要（Context Builder 裁剪后的最小片段）。 */
export interface ProviderCandidate {
  id: string;
  kind: string;
  code: string;
  title: string;
  state: string;
  sourceStatus: string;
}

/** 预算：输入上下文上限与输出上限（token 估算值）。 */
export interface ProviderBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
}

/** 发往 Provider 的统一请求。 */
export interface ProviderRequest {
  messages: ProviderMessage[];
  /** JSON Schema 约束输出结构（来自 docs/api/schemas，不在此复制）。 */
  jsonSchema: Record<string, unknown>;
  budget: ProviderBudget;
  timeoutMs: number;
  signal?: AbortSignal;
  /**
   * 结构化上下文旁路（最小必要片段）。真实 Provider 可忽略；FakeProvider 用它生成确定性输出。
   * 只包含 Context Builder 已按权限/预算裁剪后的候选对象。
   */
  metadata?: {
    inputText: string;
    candidates: ProviderCandidate[];
  };
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Provider 统一返回。 */
export interface ModelResult {
  provider: string;
  model: string;
  ok: boolean;
  /** 原始文本（期望为 JSON 字符串）。 */
  raw: string;
  usage: ModelUsage;
  latencyMs: number;
  error?: { code: string; message: string };
}

/** 可替换、可禁用的 Provider Adapter（ADR-005 决策 2）。 */
export interface ProviderAdapter {
  readonly name: string;
  /** 是否可用；为 false 时 `complete` 必须拒绝而非发网络请求。 */
  readonly enabled: boolean;
  complete(request: ProviderRequest): Promise<ModelResult>;
}

/** 粗略 token 估算：CJK 每字约 1 token，ASCII 每 4 字符约 1 token。 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  let asciiRun = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      asciiRun += 1;
    } else {
      if (asciiRun > 0) {
        tokens += Math.ceil(asciiRun / 4);
        asciiRun = 0;
      }
      tokens += 1;
    }
  }
  if (asciiRun > 0) tokens += Math.ceil(asciiRun / 4);
  return tokens;
}

/** 估算一组消息的输入 token。 */
export function estimateMessagesTokens(messages: readonly ProviderMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/** 可中断的等待；`signal` 触发时以 AbortError 拒绝。 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(abortError());
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const err = new Error('provider call aborted');
  err.name = 'AbortError';
  return err;
}
