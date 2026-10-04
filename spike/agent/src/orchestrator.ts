import type { ModelBundle } from '@reqatlas/testkit';
import type { AgentRun, AgentRunRequest, ChangeDraft, Problem } from './contract';
import { buildContext } from './context/context-builder';
import type { ContextPackage, ContextPermissions } from './context/types';
import type { DomainGuard } from './guard/domain-guard';
import type { SchemaGuard } from './guard/schema-guard';
import type { DraftStore } from './draft/draft-store';
import type { ProviderAdapter, ProviderMessage, ProviderRequest } from './provider/types';
import type { Retriever } from './retriever/retriever';

/**
 * 自研编排链路：Context Builder → Retriever → Provider Adapter → Schema Guard → Domain Guard → Draft Store。
 * 状态机遵循 `docs/api/schemas/agent-run.json`：queued → running → needs_input | succeeded | failed | cancelled。
 */

export interface AgentPolicy {
  /** Context Builder 的输入 token 预算（最小上下文裁剪）。 */
  contextTokenBudget: number;
  /** Provider 输入上限；上下文估算超过即阻断，不调用模型。 */
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  /** 格式失败最多自动修复次数（§7.2：一次）。 */
  maxRepair: number;
  defaultMaxQuestions: number;
  /** 追问最多追加轮数（防止无限追问）。 */
  maxFollowUpRounds: number;
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  contextTokenBudget: 800,
  maxInputTokens: 6000,
  maxOutputTokens: 2048,
  timeoutMs: 15_000,
  maxRepair: 1,
  defaultMaxQuestions: 3,
  maxFollowUpRounds: 1,
};

export interface AgentDependencies {
  provider: ProviderAdapter;
  bundle: ModelBundle;
  retriever: Retriever;
  schemaGuard: SchemaGuard;
  domainGuard: DomainGuard;
  draftStore: DraftStore;
  policy?: Partial<AgentPolicy>;
  permissions?: ContextPermissions;
  foreignProjectById?: ReadonlyMap<string, string>;
  now?: () => Date;
  newId?: (prefix: string) => string;
}

export interface AgentOutcome {
  run: AgentRun;
  draft?: ChangeDraft;
  context?: ContextPackage;
  /** 实际调用 Provider 的次数（含修复重试），用于断言「不无限重试」。 */
  providerCalls: number;
  problem?: Problem;
}

export interface FollowUpFn {
  (questions: readonly string[], round: number): string | undefined;
}

let idCounter = 0;
function defaultNewId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function resolvePolicy(policy?: Partial<AgentPolicy>): AgentPolicy {
  return { ...DEFAULT_AGENT_POLICY, ...policy };
}

async function invokeProvider(
  provider: ProviderAdapter,
  request: ProviderRequest,
  timeoutMs: number,
): Promise<Awaited<ReturnType<ProviderAdapter['complete']>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.complete({ ...request, timeoutMs, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function repairMessages(
  original: ProviderMessage[],
  previousRaw: string,
  errors: string[],
): ProviderMessage[] {
  return [
    ...original,
    { role: 'assistant', content: previousRaw },
    {
      role: 'user',
      content:
        '上一条输出不符合 Schema，请**只**输出一个符合给定 JSON Schema 的 JSON 对象，不要任何解释。\n' +
        '校验错误：' +
        errors.join('; '),
    },
  ];
}

interface ParseOutcome {
  draft?: ChangeDraft;
  raw: string;
  errors: string[];
  providerCalls: number;
  cancelled: boolean;
  problem?: Problem;
}

async function obtainValidDraft(
  provider: ProviderAdapter,
  baseMessages: ProviderMessage[],
  jsonSchema: Record<string, unknown>,
  metadata: ProviderRequest['metadata'],
  policy: AgentPolicy,
  schemaGuard: SchemaGuard,
): Promise<ParseOutcome> {
  let messages = baseMessages;
  let providerCalls = 0;
  let lastRaw = '';
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= policy.maxRepair; attempt += 1) {
    const request: ProviderRequest = {
      messages,
      jsonSchema,
      metadata,
      budget: { maxInputTokens: policy.maxInputTokens, maxOutputTokens: policy.maxOutputTokens },
      timeoutMs: policy.timeoutMs,
    };
    const result = await invokeProvider(provider, request, policy.timeoutMs);
    providerCalls += 1;
    if (!result.ok) {
      if (result.error?.code === 'CANCELLED') {
        return { raw: '', errors: [], providerCalls, cancelled: true };
      }
      return {
        raw: lastRaw,
        errors: [],
        providerCalls,
        cancelled: false,
        problem: {
          type: 'https://reqatlas.example/problems/DEPENDENCY_UNAVAILABLE',
          title: '模型不可用',
          status: 503,
          code: 'DEPENDENCY_UNAVAILABLE',
          detail: result.error?.message ?? 'provider 调用失败',
          requestId: 'req_agent_provider',
        },
      };
    }

    lastRaw = result.raw;
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.raw);
    } catch (err) {
      lastErrors = [`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`];
      if (attempt < policy.maxRepair) {
        messages = repairMessages(baseMessages, result.raw, lastErrors);
        continue;
      }
      break;
    }

    const validation = schemaGuard.validateDraft(parsed);
    if (validation.valid) {
      return { draft: parsed as ChangeDraft, raw: result.raw, errors: [], providerCalls, cancelled: false };
    }
    lastErrors = validation.errors;
    if (attempt < policy.maxRepair) {
      messages = repairMessages(baseMessages, result.raw, lastErrors);
      continue;
    }
  }

  return {
    raw: lastRaw,
    errors: lastErrors,
    providerCalls,
    cancelled: false,
    problem: {
      type: 'https://reqatlas.example/problems/VALIDATION_FAILED',
      title: '模型输出不符合 Schema',
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: '格式失败已自动修复一次仍不合法，转人工处理。',
      requestId: 'req_agent_validation',
      context: { fieldErrors: lastErrors },
    },
  };
}

async function runAgentOnce(
  request: AgentRunRequest,
  inputText: string,
  deps: AgentDependencies,
): Promise<AgentOutcome> {
  const policy = resolvePolicy(deps.policy);
  const now = deps.now ?? ((): Date => new Date());
  const newId = deps.newId ?? defaultNewId;
  const runId = newId('run');
  const createdAt = now().toISOString();

  const context = buildContext({
    bundle: deps.bundle,
    scope: request.scope,
    task: request.task,
    input: { text: inputText, selectedObjectIds: request.input.selectedObjectIds },
    tokenBudget: policy.contextTokenBudget,
    permissions: deps.permissions,
    retriever: deps.retriever,
  });

  const baseRun: AgentRun = {
    id: runId,
    task: request.task,
    scope: request.scope,
    status: 'running',
    createdAt,
    updatedAt: createdAt,
  };

  if (context.estimatedInputTokens > policy.maxInputTokens) {
    return {
      run: {
        ...baseRun,
        status: 'failed',
        error: {
          code: 'BUDGET_EXCEEDED',
          message: `上下文估算 ${context.estimatedInputTokens} token 超过上限 ${policy.maxInputTokens}，阻断且不重试。`,
        },
      },
      context,
      providerCalls: 0,
    };
  }

  const jsonSchema = deps.schemaGuard.readRawSchema('change-draft.json');
  const parsed = await obtainValidDraft(
    deps.provider,
    context.messages,
    jsonSchema,
    { inputText, candidates: context.candidates },
    policy,
    deps.schemaGuard,
  );

  if (parsed.cancelled) {
    return {
      run: { ...baseRun, status: 'cancelled' },
      context,
      providerCalls: parsed.providerCalls,
    };
  }
  if (!parsed.draft) {
    return {
      run: {
        ...baseRun,
        status: 'failed',
        error: {
          code: parsed.problem?.code ?? 'VALIDATION_FAILED',
          message: parsed.problem?.detail ?? '模型输出不合法',
        },
      },
      context,
      providerCalls: parsed.providerCalls,
      problem: parsed.problem,
    };
  }

  const maxQuestions = request.options?.maxQuestions ?? policy.defaultMaxQuestions;
  const draft: ChangeDraft = {
    ...parsed.draft,
    basedOnRevision: deps.bundle.projectRevision,
    scope: request.scope,
    // 追问有上限：超过 maxQuestions 直接截断，绝不无限追问。
    questions: (parsed.draft.questions ?? []).slice(0, maxQuestions),
    validation: { blocking: [], warnings: [] },
  };

  const domain = deps.domainGuard.check(draft, deps.bundle, {
    foreignProjectById: deps.foreignProjectById,
  });
  draft.validation = { blocking: domain.blocking, warnings: domain.warnings };

  deps.draftStore.save(draft);

  const askedQuestions = (draft.questions ?? []).map((q) => q.text);
  const needsInput =
    askedQuestions.length > 0 && domain.blocking.length === 0 && (draft.changes ?? []).length === 0;
  return {
    run: {
      ...baseRun,
      status: needsInput ? 'needs_input' : 'succeeded',
      draftId: draft.draftId,
      ...(needsInput ? { questions: askedQuestions } : {}),
      updatedAt: now().toISOString(),
    },
    draft,
    context,
    providerCalls: parsed.providerCalls,
  };
}

/** 单轮：从自然语言输入到结构化 ChangeDraft（含两次校验）。 */
export function runAgent(request: AgentRunRequest, deps: AgentDependencies): Promise<AgentOutcome> {
  return runAgentOnce(request, request.input.text, deps);
}

/**
 * 带有界追问的编排：needs_input 时最多追加 `maxFollowUpRounds` 轮。
 * 达到上限后**停止追问并产出草案**（status 收敛为 succeeded），不会无限追问。
 * 中途取消/失败时保留此前已产出的草案。
 */
export async function runAgentConversation(
  request: AgentRunRequest,
  deps: AgentDependencies,
  answer: FollowUpFn,
): Promise<AgentOutcome> {
  const policy = resolvePolicy(deps.policy);
  let text = request.input.text;
  let last: AgentOutcome | undefined;

  for (let round = 0; ; round += 1) {
    const outcome = await runAgentOnce(request, text, deps);
    if (outcome.draft) last = outcome;

    if (outcome.run.status === 'needs_input') {
      if (round >= policy.maxFollowUpRounds) {
        return { ...outcome, run: { ...outcome.run, status: 'succeeded' } };
      }
      const next = answer(outcome.run.questions ?? [], round);
      if (next === undefined) return outcome;
      text = next;
      continue;
    }

    if (outcome.run.status === 'cancelled' && last?.draft) {
      return {
        ...outcome,
        draft: last.draft,
        run: { ...outcome.run, draftId: last.draft.draftId },
      };
    }
    return outcome;
  }
}
