import { describe, expect, it, vi } from 'vitest';
import { FakeProvider } from '../provider/fake-provider';
import {
  OpenAICompatibleProvider,
  createDefaultProvider,
  readOpenAICompatibleConfig,
} from '../provider/openai-compatible-provider';
import { estimateTokens, type ProviderRequest } from '../provider/types';

function baseRequest(): ProviderRequest {
  return {
    messages: [{ role: 'user', content: '把财务加入折扣审批' }],
    jsonSchema: { type: 'object' },
    budget: { maxInputTokens: 1000, maxOutputTokens: 1000 },
    timeoutMs: 1000,
  };
}

describe('FakeProvider', () => {
  it('确定性：同一输入产生同一输出', async () => {
    const provider = new FakeProvider({ respond: (r) => JSON.stringify({ n: r.messages.length }) });
    const req = baseRequest();
    const first = await provider.complete(req);
    const second = await provider.complete(req);
    expect(first.ok).toBe(true);
    expect(first.raw).toBe(second.raw);
  });

  it('可注入故意畸形的 JSON（Provider 不校验，交由 Schema Guard）', async () => {
    const provider = new FakeProvider({ respond: () => '{ 这不是合法 JSON' });
    const result = await provider.complete(baseRequest());
    expect(result.ok).toBe(true);
    expect(() => JSON.parse(result.raw)).toThrow();
  });

  it('延迟调用可被 AbortSignal 中断，返回 CANCELLED', async () => {
    const provider = new FakeProvider({ respond: () => '{}', delayMs: 5000 });
    const controller = new AbortController();
    const pending = provider.complete({ ...baseRequest(), signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CANCELLED');
  });
});

describe('外部模型默认关闭', () => {
  it('缺省配置即禁用，且不发起任何网络请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = createDefaultProvider({});
    expect(provider.enabled).toBe(false);
    const result = await provider.complete(baseRequest());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_DISABLED');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('仅当显式 openai + baseUrl + apiKey 齐全才启用', () => {
    expect(readOpenAICompatibleConfig({ REQATLAS_AGENT_PROVIDER: 'fake' }).enabled).toBe(false);
    expect(readOpenAICompatibleConfig({ REQATLAS_AGENT_PROVIDER: 'openai' }).enabled).toBe(true);
    expect(
      new OpenAICompatibleProvider(
        readOpenAICompatibleConfig({ REQATLAS_AGENT_PROVIDER: 'openai' }),
      ).enabled,
    ).toBe(false);

    const full = readOpenAICompatibleConfig({
      REQATLAS_AGENT_PROVIDER: 'openai',
      REQATLAS_AGENT_BASE_URL: 'https://example.invalid/v1',
      REQATLAS_AGENT_API_KEY: 'test-key',
    });
    const provider = new OpenAICompatibleProvider(full);
    expect(provider.enabled).toBe(true);
    // 注意：本仓库无外网凭据，这里仅断言「配置可用」，绝不调用 complete（避免真实网络请求）。
  });
});

describe('token 估算', () => {
  it('CJK 每字约 1 token，ASCII 每 4 字符约 1 token', () => {
    expect(estimateTokens('财务')).toBe(2);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('')).toBe(0);
  });
});
