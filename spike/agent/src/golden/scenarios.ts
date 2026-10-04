import type { AgentRunRequest, DraftIntent } from '../contract';
import { FakeProvider } from '../provider/fake-provider';
import { planDraft } from './planner';

/**
 * 中文金样例集（M5-08）：折扣审批、信用异常、采购质检、职责冲突。
 * 全部走 FakeProvider 确定性输出，用于回归与安全用例。
 */

export interface GoldenExpectation {
  intent: DraftIntent;
  /** 必须被**引用**的既有对象 code（证明复用而非重复创建）。 */
  mustReferenceObjectCodes: string[];
  /** 不得出现的 create model_object 的 code（避免为既有对象建同名临时对象）。 */
  forbiddenCreateCodes: string[];
  /** 期望出现在 validation.blocking 的规则码。 */
  expectBlockingRuleCodes: string[];
  /** 期望草案至少带非空 sourceRefs 的操作数。 */
  expectSourceRefsNonEmpty: boolean;
}

export interface GoldenScenario {
  id: string;
  title: string;
  request: AgentRunRequest;
  expectation: GoldenExpectation;
}

export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  {
    id: 'discount-approval',
    title: '折扣审批',
    request: {
      task: 'build_model',
      scope: { type: 'project', id: 'PRJ-TRADE-001' },
      input: { text: '把财务加入折扣审批，折扣超过 10% 需要销售经理审批。' },
      options: { maxQuestions: 3 },
    },
    expectation: {
      intent: 'create',
      mustReferenceObjectCodes: ['ROLE-003', 'ROLE-002', 'ACT-003'],
      forbiddenCreateCodes: ['ROLE-003'],
      expectBlockingRuleCodes: [],
      expectSourceRefsNonEmpty: true,
    },
  },
  {
    id: 'credit-exception',
    title: '信用异常',
    request: {
      task: 'build_model',
      scope: { type: 'project', id: 'PRJ-TRADE-001' },
      input: { text: '客户信用不足时需要转财务特批，请补充异常处理去向。' },
      options: { maxQuestions: 3 },
    },
    expectation: {
      intent: 'create',
      mustReferenceObjectCodes: ['ROLE-003', 'PROB-002', 'ACT-009'],
      forbiddenCreateCodes: ['ROLE-003', 'PROB-002'],
      expectBlockingRuleCodes: [],
      expectSourceRefsNonEmpty: true,
    },
  },
  {
    id: 'purchase-qc',
    title: '采购质检',
    request: {
      task: 'build_model',
      scope: { type: 'project', id: 'PRJ-TRADE-001' },
      input: { text: '到货后需要采购质检才能入库，请新增质检环节。' },
      options: { maxQuestions: 3 },
    },
    expectation: {
      intent: 'create',
      mustReferenceObjectCodes: ['ROLE-005'],
      forbiddenCreateCodes: ['ROLE-005'],
      expectBlockingRuleCodes: [],
      expectSourceRefsNonEmpty: true,
    },
  },
  {
    id: 'role-conflict',
    title: '职责冲突',
    request: {
      task: 'check_completeness',
      scope: { type: 'project', id: 'PRJ-TRADE-001' },
      input: { text: '折扣审批同时由销售经理和财务最终负责。' },
      options: { maxQuestions: 3 },
    },
    expectation: {
      intent: 'check',
      mustReferenceObjectCodes: ['ROLE-003', 'ACT-003'],
      forbiddenCreateCodes: ['ROLE-003', 'ACT-003'],
      expectBlockingRuleCodes: ['ACTIVITY_MULTI_A'],
      expectSourceRefsNonEmpty: true,
    },
  },
];

export function getGoldenScenario(id: string): GoldenScenario {
  const scenario = GOLDEN_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`未知金样例：${id}`);
  return scenario;
}

/**
 * 为某金样例构造确定性 FakeProvider。
 * 它只读取 Context Builder 传来的最小候选片段（`request.metadata`），不接触整个 bundle。
 */
export function createGoldenProvider(scenarioId: string): FakeProvider {
  return new FakeProvider({
    name: `fake:${scenarioId}`,
    model: 'fake-golden-v1',
    respond: (request) => {
      const candidates = request.metadata?.candidates ?? [];
      const inputText = request.metadata?.inputText ?? '';
      const plan = planDraft(scenarioId, { candidates, inputText });
      plan.basedOnRevision = 0;
      return JSON.stringify(plan);
    },
  });
}
