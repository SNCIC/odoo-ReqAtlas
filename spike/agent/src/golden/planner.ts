import type {
  ChangeDraft,
  ConfidenceState,
  DraftChange,
  DraftIntent,
  SourceRef,
} from '../contract';
import type { ProviderCandidate } from '../provider/types';

/**
 * 金样例「模型规划器」。
 *
 * 这是 FakeProvider 的确定性响应来源——它**只使用 Context Builder 传给模型的候选片段**
 * （而非整个 bundle），因此可以证明：模型能复用检索到的既有对象 ID，而不是重复创建。
 */

export interface PlannerInput {
  candidates: readonly ProviderCandidate[];
  inputText: string;
}

const USER_SOURCE: SourceRef = { type: 'user_input', id: 'msg_1' };

function candidate(candidates: readonly ProviderCandidate[], code: string): ProviderCandidate {
  const found = candidates.find((c) => c.code === code);
  if (!found) {
    throw new Error(`golden planner 缺少候选对象 ${code}（最小上下文未检索到该对象）`);
  }
  return found;
}

function createObjectOp(params: {
  operationId: string;
  tempId: string;
  kind: string;
  code: string;
  title: string;
  confidenceState: ConfidenceState;
  reason: string;
  payload?: Record<string, unknown>;
}): DraftChange {
  return {
    operationId: params.operationId,
    op: 'create',
    targetType: 'model_object',
    tempId: params.tempId,
    before: null,
    after: {
      kind: params.kind,
      code: params.code,
      title: params.title,
      state: 'draft',
      sourceStatus: params.confidenceState,
      payload: params.payload ?? {},
    },
    reason: params.reason,
    sourceRefs: [USER_SOURCE],
    confidenceState: params.confidenceState,
  };
}

function linkRelationOp(params: {
  operationId: string;
  tempId: string;
  kind: string;
  fromId: string;
  toId: string;
  confidenceState: ConfidenceState;
  reason: string;
}): DraftChange {
  return {
    operationId: params.operationId,
    op: 'link',
    targetType: 'model_relation',
    tempId: params.tempId,
    before: null,
    after: { kind: params.kind, fromId: params.fromId, toId: params.toId },
    reason: params.reason,
    sourceRefs: [USER_SOURCE],
    confidenceState: params.confidenceState,
  };
}

function draft(
  id: string,
  intent: DraftIntent,
  summary: string,
  changes: DraftChange[],
  questions: ChangeDraft['questions'] = [],
): ChangeDraft {
  return {
    draftId: id,
    basedOnRevision: 0,
    scope: { type: 'project', id: 'PRJ-TRADE-001' },
    intent,
    assumptions: [],
    questions,
    changes,
    sources: [USER_SOURCE],
    validation: { blocking: [], warnings: [] },
    summary,
  };
}

/** 逐样例的确定性规划（引用既有对象 → 复用）。 */
export function planDraft(scenarioId: string, input: PlannerInput): ChangeDraft {
  const { candidates } = input;
  switch (scenarioId) {
    case 'discount-approval': {
      const finance = candidate(candidates, 'ROLE-003');
      const manager = candidate(candidates, 'ROLE-002');
      const approval = candidate(candidates, 'ACT-003');
      return draft(
        'draft_discount_approval',
        'create',
        '把财务（复用 ROLE-003）加入折扣审批作为被咨询方，并新增一个由销售经理负责的折扣财务复核事项。',
        [
          linkRelationOp({
            operationId: 'op_1',
            tempId: 'tmp_rel_consult_finance',
            kind: 'consulted_C',
            fromId: finance.id,
            toId: approval.id,
            confidenceState: 'user_statement',
            reason: '用户要求把财务加入折扣审批（被咨询）',
          }),
          createObjectOp({
            operationId: 'op_2',
            tempId: 'tmp_activity_discount_recheck',
            kind: 'activity',
            code: 'ACT-011',
            title: '折扣财务复核',
            confidenceState: 'user_statement',
            reason: '折扣超过 10% 后需财务复核',
          }),
          linkRelationOp({
            operationId: 'op_3',
            tempId: 'tmp_rel_recheck_r',
            kind: 'performs_R',
            fromId: finance.id,
            toId: 'tmp_activity_discount_recheck',
            confidenceState: 'user_statement',
            reason: '财务执行折扣复核',
          }),
          linkRelationOp({
            operationId: 'op_4',
            tempId: 'tmp_rel_recheck_a',
            kind: 'accountable_A',
            fromId: manager.id,
            toId: 'tmp_activity_discount_recheck',
            confidenceState: 'user_statement',
            reason: '销售经理对折扣复核最终负责',
          }),
        ],
      );
    }
    case 'credit-exception': {
      const finance = candidate(candidates, 'ROLE-003');
      const problem = candidate(candidates, 'PROB-002');
      const creditApproval = candidate(candidates, 'ACT-009');
      return draft(
        'draft_credit_exception',
        'create',
        '新增需求「信用不足自动转财务特批」（复用 PROB-002 为来源），并让财务参与特批事项。',
        [
          createObjectOp({
            operationId: 'op_1',
            tempId: 'tmp_requirement_credit',
            kind: 'requirement',
            code: 'REQ-004',
            title: '信用不足自动转财务特批',
            confidenceState: 'agent_inference',
            reason: '客户信用不足需有明确处理去向',
          }),
          linkRelationOp({
            operationId: 'op_2',
            tempId: 'tmp_rel_req_derived',
            kind: 'derived_from',
            fromId: 'tmp_requirement_credit',
            toId: problem.id,
            confidenceState: 'agent_inference',
            reason: '需求来源于「客户信用与逾期信息分散」问题',
          }),
          linkRelationOp({
            operationId: 'op_3',
            tempId: 'tmp_rel_credit_finance',
            kind: 'consulted_C',
            fromId: finance.id,
            toId: creditApproval.id,
            confidenceState: 'user_statement',
            reason: '财务参与信用特批',
          }),
        ],
      );
    }
    case 'purchase-qc': {
      const purchase = candidate(candidates, 'ROLE-005');
      return draft(
        'draft_purchase_qc',
        'create',
        '新增「到货质检」事项（复用采购 ROLE-005 作为执行与负责方）。',
        [
          createObjectOp({
            operationId: 'op_1',
            tempId: 'tmp_activity_qc',
            kind: 'activity',
            code: 'ACT-012',
            title: '到货质检',
            confidenceState: 'user_statement',
            reason: '到货后需质检才能入库',
          }),
          linkRelationOp({
            operationId: 'op_2',
            tempId: 'tmp_rel_qc_r',
            kind: 'performs_R',
            fromId: purchase.id,
            toId: 'tmp_activity_qc',
            confidenceState: 'user_statement',
            reason: '采购执行到货质检',
          }),
          linkRelationOp({
            operationId: 'op_3',
            tempId: 'tmp_rel_qc_a',
            kind: 'accountable_A',
            fromId: purchase.id,
            toId: 'tmp_activity_qc',
            confidenceState: 'user_statement',
            reason: '采购对到货质检最终负责',
          }),
        ],
      );
    }
    case 'role-conflict': {
      const finance = candidate(candidates, 'ROLE-003');
      const approval = candidate(candidates, 'ACT-003');
      return draft(
        'draft_role_conflict',
        'check',
        '用户称折扣审批同时由销售经理与财务最终负责，产生多个 A，应阻断并请人工裁定唯一负责人。',
        [
          linkRelationOp({
            operationId: 'op_1',
            tempId: 'tmp_rel_conflict_a',
            kind: 'accountable_A',
            fromId: finance.id,
            toId: approval.id,
            confidenceState: 'user_statement',
            reason: '用户称财务也是折扣审批的最终负责方',
          }),
        ],
      );
    }
    default:
      throw new Error(`未知金样例：${scenarioId}`);
  }
}
