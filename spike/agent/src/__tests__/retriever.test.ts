import { describe, expect, it } from 'vitest';
import { createDependencies } from '../harness';
import { getGoldenScenario, GOLDEN_SCENARIOS, createGoldenProvider } from '../golden/scenarios';
import { loadDemoTradeBundle } from '../load';
import { runAgent } from '../orchestrator';
import { createRetriever } from '../retriever/retriever';
import type { ChangeDraft } from '../contract';

const bundle = loadDemoTradeBundle();
const retriever = createRetriever(bundle);

function createdObjectCodes(draft: ChangeDraft): string[] {
  return (draft.changes ?? [])
    .filter((c) => c.op === 'create' && c.targetType === 'model_object')
    .map((c) => String((c.after as Record<string, unknown> | null)?.code ?? ''));
}

describe('Retriever：名称/编号/术语检索', () => {
  it('把「财务」解析到既有 ROLE-003，而不是新建', () => {
    expect(retriever.resolve('财务')?.id).toBe('ROLE-003');
    expect(retriever.resolve('销售经理')?.id).toBe('ROLE-002');
    expect(retriever.resolve('采购')?.id).toBe('ROLE-005');
  });

  it('按编号与术语检索', () => {
    expect(retriever.search('ACT-003').map((m) => m.object.code)).toContain('ACT-003');
    expect(retriever.search('折扣').map((m) => m.object.code)).toContain('DEC-001');
  });
});

describe('对象复用：草案引用既有对象而非重复创建', () => {
  it('「把财务加入折扣审批」的草案不包含为财务 create 的操作', async () => {
    const scenario = getGoldenScenario('discount-approval');
    const deps = createDependencies({ bundle, provider: createGoldenProvider(scenario.id) });
    const outcome = await runAgent(scenario.request, deps);
    const draft = outcome.draft;
    expect(draft).toBeDefined();

    const created = createdObjectCodes(draft!);
    expect(created).not.toContain('ROLE-003');
    expect(created).not.toContain('ROLE-002');

    // 草案必须通过既有 ID 引用财务与销售经理
    const serialized = JSON.stringify(draft!.changes);
    expect(serialized).toContain('ROLE-003');
    expect(serialized).toContain('ROLE-002');
  });

  it('全部金样例都不为既有角色/对象重复创建', async () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      const deps = createDependencies({ bundle, provider: createGoldenProvider(scenario.id) });
      const outcome = await runAgent(scenario.request, deps);
      const created = createdObjectCodes(outcome.draft!);
      for (const forbidden of scenario.expectation.forbiddenCreateCodes) {
        expect(created, `样例 ${scenario.id} 不应 create ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
