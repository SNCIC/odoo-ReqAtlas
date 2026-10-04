import type { ModelBundle } from '@reqatlas/testkit';
import type { ChangeDraft, ChangeSet, ChangeSetOperation, Finding, Problem } from '../contract';
import type { SchemaGuard } from '../guard/schema-guard';

/**
 * 把「用户逐项选择」的草案操作转成 ChangeSet（模型写入的唯一凭证）。
 *
 * 关键点：
 * - 只接受显式选择的操作（`selectedOperationIds`），不存在「默认全选」；
 * - 应用前按**当前 revision** 二次校验（过期草案拒绝）；
 * - `assumptions` 非空的草案一律拒绝（AGENT_ASSUMPTION）；
 * - 事实型操作无 `sourceRefs` 一律拒绝；
 * - 产物是 ChangeSet JSON，**打印或写文件，不写数据库、不动 bundle**。
 */

export interface ApplyRequest {
  draft: ChangeDraft;
  selectedOperationIds: readonly string[];
  bundle: ModelBundle;
  currentRevision: number;
  schemaGuard: SchemaGuard;
  requestId?: string;
}

export interface ApplyResult {
  ok: boolean;
  changeSet?: ChangeSet;
  problem?: Problem;
  appliedOperationIds?: string[];
}

const HTTP_BY_CODE: Record<string, number> = {
  VALIDATION_FAILED: 400,
  REVISION_CONFLICT: 409,
  DOMAIN_RULE_BLOCKED: 422,
};

function makeProblem(
  code: keyof typeof HTTP_BY_CODE,
  title: string,
  detail: string,
  requestId: string,
  context?: Record<string, unknown>,
): Problem {
  return {
    type: `https://reqatlas.example/problems/${code}`,
    title,
    status: HTTP_BY_CODE[code],
    code,
    detail,
    requestId,
    ...(context !== undefined ? { context } : {}),
  };
}

export function applyDraft(request: ApplyRequest): ApplyResult {
  const { draft, selectedOperationIds, currentRevision, schemaGuard } = request;
  const requestId = request.requestId ?? 'req_change_draft_apply';

  if (draft.basedOnRevision !== currentRevision) {
    return {
      ok: false,
      problem: makeProblem(
        'REVISION_CONFLICT',
        '草案基准版本已过期',
        `草案基于 revision ${draft.basedOnRevision}，当前为 ${currentRevision}，请刷新差异后人工合并。`,
        requestId,
        { expected: draft.basedOnRevision, actual: currentRevision },
      ),
    };
  }

  if (draft.assumptions.length > 0) {
    const findings: Finding[] = [
      {
        ruleCode: 'AGENT_ASSUMPTION',
        severity: 'block',
        objectIds: [],
        message: `草案含 ${draft.assumptions.length} 条假设，假设不能进入基线。`,
      },
    ];
    return {
      ok: false,
      problem: makeProblem(
        'DOMAIN_RULE_BLOCKED',
        '草案含假设，禁止应用',
        'assumptions 只能停留在草案态；请人工确认后重新生成无假设操作。',
        requestId,
        { findings },
      ),
    };
  }

  if (draft.validation.blocking.length > 0) {
    return {
      ok: false,
      problem: makeProblem(
        'DOMAIN_RULE_BLOCKED',
        '草案存在阻断项',
        '草案 validation.blocking 非空，需修复后重新校验。',
        requestId,
        { findings: draft.validation.blocking },
      ),
    };
  }

  const changes = draft.changes ?? [];
  const selection = new Set(selectedOperationIds);
  const selected = changes.filter((c) => selection.has(c.operationId));
  if (selected.length === 0) {
    return {
      ok: false,
      problem: makeProblem(
        'VALIDATION_FAILED',
        '未选择任何操作',
        'apply 只接受用户逐项选择的操作，selectedOperationIds 不能为空或不匹配任何变更。',
        requestId,
        { fieldErrors: [{ field: 'selectedOperationIds', message: '没有匹配的 operationId' }] },
      ),
    };
  }

  const sourceFindings: Finding[] = [];
  for (const c of selected) {
    if (c.op !== 'delete' && (c.sourceRefs?.length ?? 0) === 0) {
      sourceFindings.push({
        ruleCode: 'SOURCE_REQUIRED',
        severity: 'block',
        objectIds: [c.targetId ?? c.tempId ?? c.operationId],
        message: `操作 ${c.operationId}（${c.op}）为事实型操作但 sourceRefs 为空，不能应用。`,
      });
    }
  }
  if (sourceFindings.length > 0) {
    return {
      ok: false,
      problem: makeProblem(
        'DOMAIN_RULE_BLOCKED',
        '无来源的事实型操作',
        '事实型操作必须携带 sourceRefs 才能进入基线。',
        requestId,
        { findings: sourceFindings },
      ),
    };
  }

  const operations: ChangeSetOperation[] = selected.map((c) => ({
    operationId: c.operationId,
    op: c.op,
    targetType: c.targetType,
    ...(c.targetId !== undefined ? { targetId: c.targetId } : {}),
    ...(c.tempId !== undefined ? { tempId: c.tempId } : {}),
    before: c.before,
    after: c.after,
    reason: c.reason,
    sourceRefs: c.sourceRefs,
    confidenceState: c.confidenceState,
  }));

  const changeSet: ChangeSet = {
    reason: draft.summary,
    source: { type: 'agent', referenceIds: [draft.draftId] },
    operations,
  };

  const validation = schemaGuard.validateChangeSet(changeSet);
  if (!validation.valid) {
    return {
      ok: false,
      problem: makeProblem(
        'VALIDATION_FAILED',
        'ChangeSet 未通过 Schema 校验',
        '生成的 ChangeSet 不符合 docs/api/schemas/change-set.json。',
        requestId,
        { fieldErrors: validation.errors },
      ),
    };
  }

  return { ok: true, changeSet, appliedOperationIds: operations.map((o) => o.operationId) };
}
