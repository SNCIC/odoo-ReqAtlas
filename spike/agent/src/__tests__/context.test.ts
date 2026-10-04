import { describe, expect, it } from 'vitest';
import { buildContext } from '../context/context-builder';
import { getGoldenScenario } from '../golden/scenarios';
import { loadDemoTradeBundle } from '../load';
import { createRetriever } from '../retriever/retriever';

const bundle = loadDemoTradeBundle();
const retriever = createRetriever(bundle);
const scenario = getGoldenScenario('discount-approval');

function build(text: string, allowed?: ReadonlySet<string>) {
  return buildContext({
    bundle,
    scope: scenario.request.scope,
    task: 'build_model',
    input: { text },
    tokenBudget: 800,
    retriever,
    ...(allowed !== undefined ? { permissions: { allowedObjectIds: allowed } } : {}),
  });
}

describe('Context Builder：最小上下文', () => {
  it('发往 Provider 的上下文远小于整个项目（不含无关对象）', () => {
    const ctx = build(scenario.request.input.text);
    const fullBundleChars = JSON.stringify(bundle).length;
    const sentChars = ctx.messages.map((m) => m.content).join('').length;

    expect(ctx.objects.length).toBeGreaterThan(0);
    // 断言由被测数据（对象总数）派生，避免写死 33 之类的魔数。
    expect(ctx.objects.length).toBeLessThan(bundle.modelObject.length);
    expect(sentChars).toBeLessThan(fullBundleChars / 2);

    const codes = new Set(ctx.objects.map((o) => o.code));
    expect(codes.has('ROLE-003')).toBe(true); // 财务（检索命中）
    expect(codes.has('ACT-003')).toBe(true); // 折扣审批（检索命中）
    expect(codes.has('SYS-001')).toBe(false); // 无关对象不得出现
    expect(codes.has('ROLE-006')).toBe(false);
  });

  it('权限过滤：只保留被授权对象', () => {
    const allowed = new Set(['ROLE-003', 'ACT-003']);
    const ctx = build(scenario.request.input.text, allowed);
    expect(ctx.objects.length).toBeGreaterThan(0);
    for (const o of ctx.objects) expect(allowed.has(o.id)).toBe(true);
  });

  it('消息标记用户输入为 untrusted_content 且包含候选片段', () => {
    const ctx = build(scenario.request.input.text);
    const userMessage = ctx.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('untrusted_content');
    expect(userMessage?.content).toContain('ROLE-003');
  });
});
