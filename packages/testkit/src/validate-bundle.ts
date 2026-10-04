import type { ModelBundle, ModelObject, ModelRelation, ObjectKind } from './model-bundle.schema';

/**
 * 跨对象一致性校验器。
 *
 * 规则码沿用上游方案附录（流程无结束、决策无条件、异常无去向、事项无 R、多个 A 等）；
 * severity 语义：
 * - `block`：违反则必须阻断 ChangeSet 应用（§5.3 单事务整体回滚）。
 * - `error`：语义错误，需修正后才能进入基线。
 * - `warn`：质量提示，不阻断。
 */

export type FindingSeverity = 'block' | 'error' | 'warn';

export interface Finding {
  ruleCode: string;
  severity: FindingSeverity;
  objectIds: string[];
  message: string;
}

export interface BundleStats {
  projectId: string;
  projectRevision: number;
  objectTotal: number;
  relationTotal: number;
  viewTotal: number;
  viewLayoutTotal: number;
  evidenceTotal: number;
  evidenceLinkTotal: number;
  countByKind: Record<string, number>;
  countByState: Record<string, number>;
  countBySourceStatus: Record<string, number>;
  countEvidenceByClassification: Record<string, number>;
}

export interface FindingCounts {
  block: number;
  error: number;
  warn: number;
  total: number;
}

export interface BundleCheckResult {
  findings: Finding[];
  stats: BundleStats;
  findingCounts: FindingCounts;
}

/** 流程节点 kind（参与 flow_to 拓扑的节点）。 */
const FLOW_NODE_KINDS: ReadonlySet<ObjectKind> = new Set([
  'activity',
  'decision',
  'start',
  'end',
  'parallel',
  'wait',
  'subprocess',
  'exception',
]);

/** 关键事实对象：必须有 evidenceLink 证据支撑（OBJECT_NO_EVIDENCE）。 */
const EVIDENCE_REQUIRED_KINDS: ReadonlySet<ObjectKind> = new Set([
  'activity',
  'decision',
  'problem',
  'requirement',
]);

/** requirement 的合法来源 kind（REQUIREMENT_NO_SOURCE）。 */
const REQUIREMENT_SOURCE_KINDS: ReadonlySet<ObjectKind> = new Set([
  'problem',
  'current_fact',
  'target',
]);

function toCountRecord(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/** 统计：对象总数 / 按 kind、state、sourceStatus 计数 / 关系与视图总数。 */
export function summarizeBundle(bundle: ModelBundle): BundleStats {
  return {
    projectId: bundle.projectId,
    projectRevision: bundle.projectRevision,
    objectTotal: bundle.modelObject.length,
    relationTotal: bundle.modelRelation.length,
    viewTotal: bundle.view.length,
    viewLayoutTotal: bundle.viewLayout.length,
    evidenceTotal: bundle.evidence.length,
    evidenceLinkTotal: bundle.evidenceLink.length,
    countByKind: toCountRecord(bundle.modelObject.map((o) => o.kind)),
    countByState: toCountRecord(bundle.modelObject.map((o) => o.state)),
    countBySourceStatus: toCountRecord(bundle.modelObject.map((o) => o.sourceStatus)),
    countEvidenceByClassification: toCountRecord(bundle.evidence.map((e) => e.classification)),
  };
}

/**
 * 执行全部跨对象一致性规则，返回 findings（顺序稳定，便于快照）。
 * 注意：本函数只做跨对象与图结构校验；单对象字段合法性由 zod Schema 负责。
 */
export function validateBundle(bundle: ModelBundle): Finding[] {
  const findings: Finding[] = [];
  const push = (
    ruleCode: string,
    severity: FindingSeverity,
    objectIds: string[],
    message: string,
  ): void => {
    findings.push({ ruleCode, severity, objectIds, message });
  };

  const objectsById = new Map<string, ModelObject>();
  for (const o of bundle.modelObject) objectsById.set(o.id, o);

  // ---- 1. code 在 projectId + kind 内唯一 ----
  const seenCode = new Map<string, string>();
  for (const o of bundle.modelObject) {
    const key = `${o.projectId}::${o.kind}::${o.code}`;
    const prior = seenCode.get(key);
    if (prior !== undefined) {
      push(
        'DUPLICATE_OBJECT_CODE',
        'block',
        [prior, o.id],
        `code "${o.code}" 在 projectId="${o.projectId}" 的 kind="${o.kind}" 内重复`,
      );
    } else {
      seenCode.set(key, o.id);
    }
  }

  // ---- 2. 对象不得跨项目 ----
  for (const o of bundle.modelObject) {
    if (o.projectId !== bundle.projectId) {
      push(
        'CROSS_PROJECT_REFERENCE',
        'block',
        [o.id],
        `对象 ${o.code} 的 projectId="${o.projectId}" 与 bundle.projectId="${bundle.projectId}" 不一致`,
      );
    }
  }

  // ---- 3. 关系端点必须存在，且不得跨项目 ----
  for (const r of bundle.modelRelation) {
    const from = objectsById.get(r.fromId);
    const to = objectsById.get(r.toId);
    if (!from || !to) {
      push(
        'RELATION_ENDPOINT_MISSING',
        'block',
        [r.id, r.fromId, r.toId],
        `关系 ${r.id}(${r.kind}) 端点缺失：${!from ? `from=${r.fromId} ` : ''}${!to ? `to=${r.toId}` : ''}`.trim(),
      );
      continue;
    }
    if (from.projectId !== bundle.projectId || to.projectId !== bundle.projectId) {
      push(
        'CROSS_PROJECT_REFERENCE',
        'block',
        [r.id, from.id, to.id],
        `关系 ${r.id}(${r.kind}) 跨项目引用：${from.projectId} -> ${to.projectId}`,
      );
    }
  }

  // ---- 4. viewLayout 引用的 object 必须存在 ----
  for (const l of bundle.viewLayout) {
    if (!objectsById.has(l.objectId)) {
      push(
        'LAYOUT_OBJECT_MISSING',
        'block',
        [l.id, l.objectId],
        `viewLayout ${l.id} 引用了不存在的对象 ${l.objectId}`,
      );
    }
  }

  // ---- 5. 索引：按 relation kind 建反向表 ----
  const relationsByTarget = new Map<string, ModelRelation[]>();
  const relationsBySource = new Map<string, ModelRelation[]>();
  for (const r of bundle.modelRelation) {
    if (!relationsByTarget.has(r.toId)) relationsByTarget.set(r.toId, []);
    relationsByTarget.get(r.toId)!.push(r);
    if (!relationsBySource.has(r.fromId)) relationsBySource.set(r.fromId, []);
    relationsBySource.get(r.fromId)!.push(r);
  }
  const incoming = (id: string, kind: ModelRelation['kind']): ModelRelation[] =>
    (relationsByTarget.get(id) ?? []).filter((r) => r.kind === kind);
  const outgoing = (id: string, kind: ModelRelation['kind']): ModelRelation[] =>
    (relationsBySource.get(id) ?? []).filter((r) => r.kind === kind);

  // ---- 6. 每个 activity 至少 1 个 performs_R（block） ----
  for (const o of bundle.modelObject) {
    if (o.kind !== 'activity') continue;
    if (incoming(o.id, 'performs_R').length === 0) {
      push('ACTIVITY_NO_R', 'block', [o.id], `活动 ${o.code}(${o.title}) 缺少执行者 performs_R`);
    }
  }

  // ---- 7. 每个 activity 至多 1 个 accountable_A（error） ----
  for (const o of bundle.modelObject) {
    if (o.kind !== 'activity') continue;
    const a = incoming(o.id, 'accountable_A');
    if (a.length > 1) {
      push(
        'ACTIVITY_MULTI_A',
        'error',
        [o.id, ...a.map((r) => r.fromId)],
        `活动 ${o.code}(${o.title}) 有 ${a.length} 个 accountable_A，应当恰好 1 个`,
      );
    }
  }

  // ---- 8. 决策出口必须有条件标签（error） ----
  for (const o of bundle.modelObject) {
    if (o.kind !== 'decision') continue;
    const branches = outgoing(o.id, 'flow_to');
    if (branches.length === 0) {
      push('DECISION_NO_CONDITION', 'error', [o.id], `决策 ${o.code}(${o.title}) 没有任何出口分支`);
      continue;
    }
    for (const b of branches) {
      const condition =
        b.label?.trim() || String((b.payload?.condition as string | undefined) ?? '').trim();
      if (!condition) {
        push(
          'DECISION_NO_CONDITION',
          'error',
          [o.id, b.id, b.toId],
          `决策 ${o.code} 的出口 ${b.id} -> ${b.toId} 缺少条件标签`,
        );
      }
    }
  }

  // ---- 9. 异常必须有明确去向（error） ----
  for (const o of bundle.modelObject) {
    if (o.kind !== 'exception') continue;
    if (outgoing(o.id, 'flow_to').length === 0) {
      push(
        'EXCEPTION_NO_TARGET',
        'error',
        [o.id],
        `异常 ${o.code}(${o.title}) 没有去向（缺少 flow_to）`,
      );
    }
  }

  // ---- 10. 流程必须能到达结束节点（block） ----
  {
    const endIds = bundle.modelObject.filter((o) => o.kind === 'end').map((o) => o.id);
    // 反向可达：沿 flow_to 的反边从 end 出发
    const reverse = new Map<string, string[]>();
    for (const r of bundle.modelRelation) {
      if (r.kind !== 'flow_to') continue;
      if (!reverse.has(r.toId)) reverse.set(r.toId, []);
      reverse.get(r.toId)!.push(r.fromId);
    }
    const canReachEnd = new Set<string>();
    const stack = [...endIds];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (canReachEnd.has(node)) continue;
      canReachEnd.add(node);
      for (const prev of reverse.get(node) ?? []) stack.push(prev);
    }
    for (const o of bundle.modelObject) {
      if (!FLOW_NODE_KINDS.has(o.kind)) continue;
      const participates = bundle.modelRelation.some(
        (r) => r.kind === 'flow_to' && (r.fromId === o.id || r.toId === o.id),
      );
      if (participates && !canReachEnd.has(o.id)) {
        push(
          'FLOW_NO_END',
          'block',
          [o.id],
          `流程节点 ${o.code}(${o.title}) 无法到达任何 end 节点`,
        );
      }
    }
  }

  // ---- 11. 需求必须有来源（derived_from -> problem/current_fact/target）（block） ----
  for (const o of bundle.modelObject) {
    if (o.kind !== 'requirement') continue;
    const sources = outgoing(o.id, 'derived_from').filter((r) => {
      const target = objectsById.get(r.toId);
      return target !== undefined && REQUIREMENT_SOURCE_KINDS.has(target.kind);
    });
    if (sources.length === 0) {
      push(
        'REQUIREMENT_NO_SOURCE',
        'block',
        [o.id],
        `需求 ${o.code}(${o.title}) 缺少来源（未通过 derived_from 追溯到 problem/current_fact/target）`,
      );
    }
  }

  // ---- 12. 证据链接完整性（EVIDENCE_LINK_DANGLING / EVIDENCE_LINK_NO_EXCERPT） ----
  const evidenceIds = new Set(bundle.evidence.map((e) => e.id));
  const linkedObjectIds = new Set<string>();
  for (const link of bundle.evidenceLink) {
    const evidenceMissing = !evidenceIds.has(link.evidenceId);
    const objectMissing = !objectsById.has(link.objectId);
    if (evidenceMissing || objectMissing) {
      push(
        'EVIDENCE_LINK_DANGLING',
        'block',
        [link.id, link.evidenceId, link.objectId],
        `证据链接 ${link.id} 悬空：${
          evidenceMissing ? `evidenceId=${link.evidenceId} ` : ''
        }${objectMissing ? `objectId=${link.objectId}` : ''}`.trim(),
      );
      continue;
    }
    linkedObjectIds.add(link.objectId);
    if (link.excerpt.trim().length === 0) {
      push(
        'EVIDENCE_LINK_NO_EXCERPT',
        'warn',
        [link.id, link.evidenceId, link.objectId],
        `证据链接 ${link.id} 缺少最小引用 excerpt`,
      );
    }
  }

  // ---- 13. 关键事实对象必须有证据链接支撑（warn） ----
  for (const o of bundle.modelObject) {
    if (!EVIDENCE_REQUIRED_KINDS.has(o.kind)) continue;
    if (!linkedObjectIds.has(o.id)) {
      push(
        'OBJECT_NO_EVIDENCE',
        'warn',
        [o.id],
        `关键事实对象 ${o.code}(${o.title}) 没有任何 evidenceLink 证据支撑`,
      );
    }
  }

  // ---- 14. 模板候选不得与已确认状态共存（block） ----
  for (const o of bundle.modelObject) {
    if (o.payload.templateCandidate !== true) continue;
    if (o.state === 'confirmed' || o.state === 'approved') {
      push(
        'TEMPLATE_CANDIDATE_CONFIRMED',
        'block',
        [o.id],
        `对象 ${o.code}(${o.title}) 标记为模板候选（templateCandidate=true）但 state="${o.state}"，语义互斥`,
      );
    }
  }

  // ---- 15. 跨角色交接必须携带数据对象（warn） ----
  {
    const accountableRoles = (activityId: string): Set<string> =>
      new Set(incoming(activityId, 'accountable_A').map((r) => r.fromId));
    for (const r of bundle.modelRelation) {
      if (r.kind !== 'flow_to') continue;
      const from = objectsById.get(r.fromId);
      const to = objectsById.get(r.toId);
      if (!from || !to || from.kind !== 'activity' || to.kind !== 'activity') continue;
      const fromRoles = accountableRoles(from.id);
      const toRoles = accountableRoles(to.id);
      const crossesRole =
        fromRoles.size > 0 && toRoles.size > 0 && [...fromRoles].every((id) => !toRoles.has(id));
      if (!crossesRole) continue;
      const objectId = r.payload?.objectId;
      const valid = typeof objectId === 'string' && objectsById.has(objectId);
      if (!valid) {
        push(
          'HANDOFF_NO_OBJECT',
          'warn',
          [r.id, from.id, to.id],
          `跨角色交接 ${from.code} -> ${to.code}（关系 ${r.id}）未携带有效数据对象 objectId`,
        );
      }
    }
  }

  return findings;
}

/** 计数 findings 的 severity 分布。 */
export function countFindings(findings: Finding[]): FindingCounts {
  const counts: FindingCounts = { block: 0, error: 0, warn: 0, total: findings.length };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** 一次性返回 findings + stats + 计数，供脚本与测试直接打印。 */
export function checkBundle(bundle: ModelBundle): BundleCheckResult {
  const findings = validateBundle(bundle);
  return {
    findings,
    stats: summarizeBundle(bundle),
    findingCounts: countFindings(findings),
  };
}
