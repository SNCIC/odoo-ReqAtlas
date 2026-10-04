import { describe, expect, it } from 'vitest';
import type { ChangeDraft, DraftChange, SourceRef } from '../contract';
import { applyDraft } from '../draft/apply';
import { createDraftStore } from '../draft/draft-store';
import { createDomainGuard } from '../guard/domain-guard';
import { createSchemaGuard } from '../guard/schema-guard';
import { createDependencies } from '../harness';
import { loadDemoTradeBundle } from '../load';
import { runAgent, runAgentConversation } from '../orchestrator';
import { createGoldenProvider, getGoldenScenario } from '../golden/scenarios';
import { FakeProvider } from '../provider/fake-provider';
import { sleep, type ModelResult, type ProviderAdapter, type ProviderRequest } from '../provider/types';

const bundle = loadDemoTradeBundle();
const schemaGuard = createSchemaGuard();
const domainGuard = createDomainGuard();
const scenario = getGoldenScenario('discount-approval');
const USER: SourceRef = { type: 'user_input', id: 'msg_1' };

async function goldenDraft(): Promise<ChangeDraft> {
  const deps = createDependencies({ bundle, provider: createGoldenProvider(scenario.id) });
  const outcome = await runAgent(scenario.request, deps);
  expect(outcome.draft).toBeDefined();
  return outcome.draft!;
}

function findingsFrom(problem: { context?: Record<string, unknown> } | undefined): string[] {
  const findings = problem?.context?.findings;
  if (!Array.isArray(findings)) return [];
  return findings.map((f) => String((f as Record<string, unknown>).ruleCode ?? ''));
}

describe('安全与边界：应用门禁', () => {
  it('assumptions 非空的草案不能应用', async () => {
    const draft = await goldenDraft();
    const result = applyDraft({
      draft: { ...draft, assumptions: ['用户尚未确认折扣阈值'] },
      selectedOperationIds: ['op_1'],
      bundle,
      currentRevision: bundle.projectRevision,
      schemaGuard,
    });
    expect(result.ok).toBe(false);
    expect(result.problem?.code).toBe('DOMAIN_RULE_BLOCKED');
    expect(findingsFrom(result.problem)).toContain('AGENT_ASSUMPTION');
  });

  it('无 sourceRefs 的事实型操作不能应用', async () => {
    const draft = await goldenDraft();
    const stripped: ChangeDraft = {
      ...draft,
      validation: { blocking: [], warnings: [] },
      changes: (draft.changes ?? []).map((c) => ({ ...c, sourceRefs: [] })),
    };
    const result = applyDraft({
      draft: stripped,
      selectedOperationIds: ['op_1'],
      bundle,
      currentRevision: bundle.projectRevision,
      schemaGuard,
    });
    expect(result.ok).toBe(false);
    expect(findingsFrom(result.problem)).toContain('SOURCE_REQUIRED');
  });

  it('未知枚举 / 悬空 targetId 被拒（Domain Guard 阻断 → apply 拒绝）', async () => {
    const base = await goldenDraft();
    const unknownEnum: DraftChange = {
      operationId: 'op_bad_enum',
      op: 'create',
      targetType: 'model_object',
      tempId: 'tmp_bad',
      before: null,
      after: {
        kind: 'gadget',
        code: 'BAD-1',
        title: '未知类型',
        state: 'draft',
        sourceStatus: 'user_statement',
        payload: {},
      },
      reason: '注入未知枚举',
      sourceRefs: [USER],
      confidenceState: 'user_statement',
    };
    const dangling: DraftChange = {
      operationId: 'op_bad_dangling',
      op: 'update',
      targetType: 'model_object',
      targetId: 'ACT-999',
      before: null,
      after: { title: '不存在' },
      reason: '注入悬空引用',
      sourceRefs: [USER],
      confidenceState: 'user_statement',
    };
    const broken: ChangeDraft = {
      ...base,
      changes: [...(base.changes ?? []), unknownEnum, dangling],
    };
    const domain = domainGuard.check(broken, bundle);
    const blockingCodes = domain.blocking.map((f) => f.ruleCode);
    expect(blockingCodes).toContain('UNKNOWN_ENUM');
    expect(blockingCodes).toContain('DANGLING_REFERENCE');

    broken.validation = { blocking: domain.blocking, warnings: domain.warnings };
    const result = applyDraft({
      draft: broken,
      selectedOperationIds: ['op_bad_enum', 'op_bad_dangling'],
      bundle,
      currentRevision: bundle.projectRevision,
      schemaGuard,
    });
    expect(result.ok).toBe(false);
    expect(result.problem?.code).toBe('DOMAIN_RULE_BLOCKED');
  });

  it('过期 revision 的草案被拒（REVISION_CONFLICT）', async () => {
    const draft = await goldenDraft();
    const result = applyDraft({
      draft,
      selectedOperationIds: ['op_1'],
      bundle,
      currentRevision: bundle.projectRevision + 1,
      schemaGuard,
    });
    expect(result.ok).toBe(false);
    expect(result.problem?.code).toBe('REVISION_CONFLICT');
  });

  it('apply 只应用用户逐项选择的操作', async () => {
    const draft = await goldenDraft();
    const result = applyDraft({
      draft,
      selectedOperationIds: ['op_1', 'op_2'],
      bundle,
      currentRevision: bundle.projectRevision,
      schemaGuard,
    });
    expect(result.ok).toBe(true);
    expect(result.changeSet?.operations.map((o) => o.operationId)).toEqual(['op_1', 'op_2']);
  });
});

describe('安全与边界：追问上限', () => {
  const questionsDraft = JSON.stringify({
    draftId: 'draft_questions',
    basedOnRevision: 0,
    scope: { type: 'project', id: bundle.projectId },
    intent: 'create',
    assumptions: [],
    questions: Array.from({ length: 10 }, (_v, i) => ({ text: `问题 ${i + 1}？` })),
    changes: [],
    sources: [USER],
    validation: { blocking: [], warnings: [] },
    summary: '需要更多信息',
  });

  it('超过 options.maxQuestions 被截断，停止无限追问', async () => {
    let calls = 0;
    const provider = new FakeProvider({
      respond: () => {
        calls += 1;
        return questionsDraft;
      },
    });
    const deps = createDependencies({ bundle, provider });
    const outcome = await runAgent(
      { ...scenario.request, options: { maxQuestions: 2 } },
      deps,
    );
    expect(outcome.run.status).toBe('needs_input');
    expect(outcome.draft?.questions?.length).toBe(2);
    expect(outcome.run.questions?.length).toBe(2);
    expect(calls).toBe(1);
  });

  it('有界追问：达到 maxFollowUpRounds 后收敛为 succeeded，调用次数有上限', async () => {
    let calls = 0;
    const provider = new FakeProvider({
      respond: () => {
        calls += 1;
        return questionsDraft;
      },
    });
    const deps = createDependencies({ bundle, provider, policy: { maxFollowUpRounds: 2 } });
    const outcome = await runAgentConversation(
      { ...scenario.request, options: { maxQuestions: 2 } },
      deps,
      () => '补充信息：折扣阈值 10%。',
    );
    expect(outcome.run.status).toBe('succeeded');
    expect(outcome.draft?.questions?.length).toBe(2);
    expect(calls).toBeLessThanOrEqual(3);
    expect(calls).toBe(3);
  });
});

describe('安全与边界：超时/取消与预算', () => {
  const questionsDraft = JSON.stringify({
    draftId: 'draft_keep',
    basedOnRevision: 0,
    scope: { type: 'project', id: bundle.projectId },
    intent: 'create',
    assumptions: [],
    questions: [{ text: '请补充折扣阈值？' }],
    changes: [],
    sources: [USER],
    validation: { blocking: [], warnings: [] },
    summary: '需要更多信息',
  });

  function result(overrides: Partial<ModelResult>): ModelResult {
    return {
      provider: 'scripted',
      model: 'scripted-v1',
      ok: true,
      raw: '',
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 0,
      ...overrides,
    };
  }

  it('超时中断后保留已产出草案（status=cancelled）', async () => {
    let calls = 0;
    const provider: ProviderAdapter = {
      name: 'scripted',
      enabled: true,
      async complete(req: ProviderRequest): Promise<ModelResult> {
        calls += 1;
        if (calls === 1) return result({ raw: questionsDraft });
        try {
          await sleep(10_000, req.signal);
        } catch (err) {
          const aborted = err instanceof Error && err.name === 'AbortError';
          return result({ ok: false, error: { code: aborted ? 'CANCELLED' : 'PROVIDER_ERROR', message: 'aborted' } });
        }
        return result({ raw: questionsDraft });
      },
    };
    const draftStore = createDraftStore();
    const deps = createDependencies({
      bundle,
      provider,
      draftStore,
      policy: { timeoutMs: 50, maxFollowUpRounds: 1 },
    });
    const outcome = await runAgentConversation(scenario.request, deps, () => '补充信息');
    expect(outcome.run.status).toBe('cancelled');
    expect(outcome.draft?.draftId).toBe('draft_keep');
    expect(draftStore.get('draft_keep')).toBeDefined();
    expect(calls).toBe(2);
  });

  it('预算超限被阻断且不调用模型、不重试', async () => {
    let calls = 0;
    const provider = new FakeProvider({
      respond: () => {
        calls += 1;
        return questionsDraft;
      },
    });
    const deps = createDependencies({ bundle, provider, policy: { maxInputTokens: 5 } });
    const outcome = await runAgent(scenario.request, deps);
    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.error?.code).toBe('BUDGET_EXCEEDED');
    expect(outcome.providerCalls).toBe(0);
    expect(calls).toBe(0);
  });
});
