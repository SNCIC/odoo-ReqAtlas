import { sourceStatusSchema } from '@reqatlas/testkit';
import { describe, expect, it } from 'vitest';
import type { ChangeDraft } from '../contract';
import { createGoldenProvider, GOLDEN_SCENARIOS } from '../golden/scenarios';
import { createDependencies } from '../harness';
import { loadDemoTradeBundle } from '../load';
import { runAgent } from '../orchestrator';

const bundle = loadDemoTradeBundle();
const confidenceValues: readonly string[] = sourceStatusSchema.options;

function createdObjectCodes(draft: ChangeDraft): string[] {
  return (draft.changes ?? [])
    .filter((c) => c.op === 'create' && c.targetType === 'model_object')
    .map((c) => String((c.after as Record<string, unknown> | null)?.code ?? ''));
}

describe('中文金样例回归（M5-08）', () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    it(`${scenario.title}：结构化字段齐全 + 来源非空 + confidenceState 合法 + validation 符合预期`, async () => {
      const provider = createGoldenProvider(scenario.id);
      const deps = createDependencies({ bundle, provider });
      const outcome = await runAgent(scenario.request, deps);

      expect(outcome.run.status).toBe('succeeded');
      const draft = outcome.draft;
      expect(draft).toBeDefined();
      const d = draft!;

      // 结构化字段齐全
      expect(d.draftId.length).toBeGreaterThan(0);
      expect(d.basedOnRevision).toBe(bundle.projectRevision);
      expect(d.intent).toBe(scenario.expectation.intent);
      expect(d.summary.length).toBeGreaterThan(0);
      expect(d.sources.length).toBeGreaterThan(0);
      expect(Array.isArray(d.changes)).toBe(true);
      expect((d.changes ?? []).length).toBeGreaterThan(0);

      // 每个操作带非空 sourceRefs 与合法 confidenceState
      for (const c of d.changes ?? []) {
        expect(c.sourceRefs.length).toBeGreaterThan(0);
        expect(confidenceValues).toContain(c.confidenceState);
        expect(c.reason.length).toBeGreaterThan(0);
      }

      // 复用既有对象（引用其稳定 ID），不为既有对象重复创建
      const serialized = JSON.stringify(d.changes);
      for (const code of scenario.expectation.mustReferenceObjectCodes) {
        const object = bundle.modelObject.find((o) => o.code === code);
        expect(object, `bundle 应含 ${code}`).toBeDefined();
        expect(serialized).toContain(object!.id);
      }
      const created = createdObjectCodes(d);
      for (const forbidden of scenario.expectation.forbiddenCreateCodes) {
        expect(created).not.toContain(forbidden);
      }

      // validation.blocking 符合预期
      const blockingCodes = d.validation.blocking.map((f) => f.ruleCode);
      for (const ruleCode of scenario.expectation.expectBlockingRuleCodes) {
        expect(blockingCodes).toContain(ruleCode);
      }
      if (scenario.expectation.expectBlockingRuleCodes.length === 0) {
        expect(d.validation.blocking).toEqual([]);
      }

      // 草案必须能通过权威 Schema Guard
      expect(deps.schemaGuard.validateDraft(d).errors).toEqual([]);
    });
  }
});
