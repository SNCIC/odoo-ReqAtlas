/**
 * 模型 → Document IR 转换器（M0-07 Spike）。
 *
 * 从不可变 ModelBundle 生成《现状调研报告》骨架。渲染器只消费本函数产出的 IR，
 * 不直接读取模型 —— 这是 ADR-008「格式与内容解耦」的落地方式。
 *
 * 可追溯性：
 * - 所有对象都带 stable code（ROLE-* / ACT-* / DEC-* / EXC-* / REQ-* / PROB-* ...），
 *   且编号与 bundle 中的 `code` 完全一致（不做重编号）；
 * - 需求章节输出 `derived_from` 来源对象编号，形成回链；
 * - 问题章节输出 `evidenceLink`（承载原 `supported_by` 语义）。
 */
import type { ModelBundle, ModelObject, ModelRelation, ObjectKind, SourceStatus } from '@reqatlas/testkit';
import {
  DOCUMENT_IR_VERSION,
  assertValidDocumentIr,
  type DocumentBlock,
  type DocumentIr,
  type ObjectRefNode,
  type TableNode,
} from './document-ir';

/** 模板版本：冻结的模板标识，写入产物元数据。 */
export const TEMPLATE_VERSION = 'current-state-report@1.0.0-m0';

/** 草稿/未确认水印标识。 */
export const DRAFT_WATERMARK = 'DRAFT — 草稿/未确认（未经签核，不得作为已确认基线）';

/** 数据来源字段说明：证据关联来自 bundle.evidenceLink（承载 supported_by 语义）。 */
export const EVIDENCE_DATA_SOURCE_FIELD = 'evidenceLink';

const KIND_LABELS: Record<ObjectKind, string> = {
  role: '岗位/角色',
  person: '人员',
  organization: '组织',
  activity: '业务活动',
  decision: '决策点',
  start: '起点',
  end: '终点',
  parallel: '并行',
  wait: '等待',
  subprocess: '子流程',
  exception: '异常',
  system: '支撑系统',
  data_object: '数据对象',
  current_fact: '现状事实',
  problem: '问题',
  target: '目标',
  requirement: '需求',
  solution_candidate: '候选方案',
  term: '术语',
};

const STATE_LABELS: Record<ModelObject['state'], string> = {
  draft: '草稿',
  pending_confirmation: '待确认',
  needs_change: '待修改',
  confirmed: '已确认',
  approved: '已批准',
  deprecated: '已废止',
};

const SOURCE_LABELS: Record<SourceStatus, string> = {
  user_statement: '用户陈述',
  material_extracted: '材料提取',
  consultant_judgment: '顾问判断',
  agent_inference: 'Agent 推断',
  confirmed_fact: '已确认事实',
  approved_requirement: '已批准需求',
};

function kindLabel(kind: ObjectKind): string {
  return KIND_LABELS[kind];
}

function stateLabel(state: ModelObject['state']): string {
  return STATE_LABELS[state];
}

function sourceLabel(source: SourceStatus): string {
  return SOURCE_LABELS[source];
}

/** 变更计数器：生成稳定、连续、可复现的章节编号。 */
class Numbering {
  private major = 0;
  private minor = 0;

  nextMajor(): string {
    this.major += 1;
    this.minor = 0;
    return `${this.major}`;
  }

  nextMinor(): string {
    this.minor += 1;
    return `${this.major}.${this.minor}`;
  }
}

function heading(number: string | undefined, text: string, level: number): DocumentBlock {
  return number === undefined
    ? { type: 'heading', level, text }
    : { type: 'heading', level, number, text };
}

function paragraph(text: string, role: 'body' | 'note' | 'watermark' = 'body'): DocumentBlock {
  return { type: 'paragraph', text, role };
}

function table(
  caption: string,
  header: string[],
  rows: string[][],
  rowRefs?: string[],
): DocumentBlock {
  const node: TableNode = { type: 'table', caption, header, rows };
  if (rowRefs) node.rowRefs = rowRefs;
  return node;
}

function objectRef(node: ObjectRefNode): DocumentBlock {
  return node;
}

function sortByCode(objects: ModelObject[]): ModelObject[] {
  return [...objects].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

function objectsOfKind(bundle: ModelBundle, kind: ObjectKind): ModelObject[] {
  return sortByCode(bundle.modelObject.filter((o) => o.kind === kind));
}

/** 按 relation kind 建立索引，避免多次扫描。 */
function buildRelationIndex(relations: ModelRelation[]): {
  incoming: (id: string, kind: ModelRelation['kind']) => ModelRelation[];
  outgoing: (id: string, kind: ModelRelation['kind']) => ModelRelation[];
} {
  const byTarget = new Map<string, ModelRelation[]>();
  const bySource = new Map<string, ModelRelation[]>();
  const push = (map: Map<string, ModelRelation[]>, key: string, value: ModelRelation): void => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const r of relations) {
    push(byTarget, r.toId, r);
    push(bySource, r.fromId, r);
  }
  return {
    incoming: (id, kind) => (byTarget.get(id) ?? []).filter((r) => r.kind === kind),
    outgoing: (id, kind) => (bySource.get(id) ?? []).filter((r) => r.kind === kind),
  };
}

export interface BuildIrOptions {
  /** ISO 8601 生成时间。显式传入以保证可复现（确定性验证固定该值）。 */
  generatedAt: string;
  templateVersion?: string;
}

/** 对象引用标题：`【CODE】标题`，稳定编号前置，便于反向校验与肉眼回链。 */
export function refTitle(o: ModelObject): string {
  return `【${o.code}】${o.title}`;
}

/**
 * 从 ModelBundle 构建《现状调研报告》的 Document IR。
 *
 * @param bundle  经过 schema 校验的模型快照
 * @param snapshotSha256 源 bundle 文件字节的 sha256（快照标识）
 */
export function buildCurrentStateReportIr(
  bundle: ModelBundle,
  snapshotSha256: string,
  options: BuildIrOptions,
): DocumentIr {
  const templateVersion = options.templateVersion ?? TEMPLATE_VERSION;
  const objectsById = new Map(bundle.modelObject.map((o) => [o.id, o]));
  // 证据集合与链接：按 schema 存在性做泛化处理，不对「是否存在」做硬编码假设。
  const evidences = bundle.evidence ?? [];
  const evidenceLinks = bundle.evidenceLink ?? [];
  const evidenceById = new Map(evidences.map((e) => [e.id, e]));
  const rel = buildRelationIndex(bundle.modelRelation);
  const num = new Numbering();
  const blocks: DocumentBlock[] = [];

  // ---------- 封面 / 元数据 ----------
  blocks.push(heading(undefined, '现状调研报告', 1));
  blocks.push(paragraph(DRAFT_WATERMARK, 'watermark'));
  blocks.push(
    table(
      '文档元数据',
      ['字段', '值'],
      [
        ['项目 ID', bundle.projectId],
        ['快照 Revision', String(bundle.projectRevision)],
        ['快照 SHA-256', snapshotSha256],
        ['生成时间', options.generatedAt],
        ['模板版本', templateVersion],
        ['文档状态', `draft（${DRAFT_WATERMARK}）`],
        ['数据来源', `${bundle.projectId} / demo-trade fixture（经 @reqatlas/testkit 读取）`],
      ],
    ),
  );
  blocks.push({ type: 'pageBreak' });

  // ---------- 1 组织与岗位职责 ----------
  blocks.push(heading(num.nextMajor(), '组织与岗位职责', 1));
  const roles = objectsOfKind(bundle, 'role');
  blocks.push(
    paragraph(
      `本报告共纳入 ${roles.length} 个岗位/角色对象，编号与模型快照中的 code 完全一致，可用于回链。`,
      'note',
    ),
  );
  blocks.push(
    table(
      '岗位/角色清单',
      ['编号', '岗位', '部门', '状态', '来源'],
      roles.map((o) => [
        o.code,
        o.title,
        String(o.payload.department ?? '—'),
        stateLabel(o.state),
        sourceLabel(o.sourceStatus),
      ]),
      roles.map((o) => o.code),
    ),
  );

  // §1 ROLE-xxx 明细：每个角色一个 objectRef（展示对象引用节点）
  for (const role of roles) {
    blocks.push(
      objectRef({
        type: 'objectRef',
        code: role.code,
        kind: role.kind,
        title: role.title,
        state: role.state,
      }),
    );
  }

  // RACI 表：由 performs_R / accountable_A / consulted_C / informed_I 关系推导
  const activities = objectsOfKind(bundle, 'activity');
  const roleCodesOf = (activityId: string, kind: ModelRelation['kind']): string =>
    rel
      .incoming(activityId, kind)
      .map((r) => objectsById.get(r.fromId)?.code ?? r.fromId)
      .join('、') || '—';
  blocks.push(
    table(
      'RACI 职责矩阵（按活动）',
      ['活动编号', 'R 执行', 'A 负责', 'C 咨询', 'I 知会'],
      activities.map((a) => [
        a.code,
        roleCodesOf(a.id, 'performs_R'),
        roleCodesOf(a.id, 'accountable_A'),
        roleCodesOf(a.id, 'consulted_C'),
        roleCodesOf(a.id, 'informed_I'),
      ]),
      activities.map((a) => a.code),
    ),
  );

  // ---------- 2 核心业务场景总览 ----------
  blocks.push(heading(num.nextMajor(), '核心业务场景总览', 1));

  blocks.push(heading(num.nextMinor(), '业务活动清单', 2));
  blocks.push(
    table(
      '业务活动（ACT-*）',
      ['编号', '活动', '阶段', '状态', '来源'],
      activities.map((o) => [
        o.code,
        o.title,
        String(o.payload.phase ?? '—'),
        stateLabel(o.state),
        sourceLabel(o.sourceStatus),
      ]),
      activities.map((o) => o.code),
    ),
  );

  blocks.push(heading(num.nextMinor(), '决策点与出口条件', 2));
  const decisions = objectsOfKind(bundle, 'decision');
  const branchesOf = (decisionId: string): string =>
    rel
      .outgoing(decisionId, 'flow_to')
      .map((r) => {
        const target = objectsById.get(r.toId)?.code ?? r.toId;
        const cond = r.label?.trim() ?? '';
        return cond ? `${cond} → ${target}` : `（无条件） → ${target}`;
      })
      .join('；') || '—';
  blocks.push(
    table(
      '决策点（DEC-*）',
      ['编号', '决策', '阶段', '出口条件'],
      decisions.map((o) => [
        o.code,
        o.title,
        String(o.payload.phase ?? '—'),
        branchesOf(o.id),
      ]),
      decisions.map((o) => o.code),
    ),
  );

  blocks.push(heading(num.nextMinor(), '异常与处置去向', 2));
  const exceptions = objectsOfKind(bundle, 'exception');
  const flowTargetsOf = (id: string): string =>
    rel
      .outgoing(id, 'flow_to')
      .map((r) => objectsById.get(r.toId)?.code ?? r.toId)
      .join('、') || '—';
  blocks.push(
    table(
      '异常（EXC-*）',
      ['编号', '异常', '状态', '投向', '来源'],
      exceptions.map((o) => [
        o.code,
        o.title,
        stateLabel(o.state),
        flowTargetsOf(o.id),
        sourceLabel(o.sourceStatus),
      ]),
      exceptions.map((o) => o.code),
    ),
  );

  blocks.push(heading(num.nextMinor(), '流程边界、数据对象与支撑系统', 2));
  const boundaryKinds: ObjectKind[] = ['start', 'end', 'data_object', 'system'];
  const boundaryObjects = sortByCode(
    bundle.modelObject.filter((o) => boundaryKinds.includes(o.kind)),
  );
  blocks.push(
    table(
      '流程边界与支撑对象（START-* / END-* / DO-* / SYS-*）',
      ['编号', '类型', '名称', '状态'],
      boundaryObjects.map((o) => [o.code, kindLabel(o.kind), o.title, stateLabel(o.state)]),
      boundaryObjects.map((o) => o.code),
    ),
  );

  // ---------- 3 问题与证据 ----------
  // 双路径：优先 `evidenceLink`（新结构，承载原 supported_by 语义）；缺失时回退到
  // `modelRelation(supported_by)`（旧结构，证据被建模为对象），并逐条标注所用来源字段。
  blocks.push(heading(num.nextMajor(), '问题与证据', 1));
  blocks.push(
    paragraph(
      evidenceLinks.length > 0
        ? `证据关联优先取自 bundle 的 \`${EVIDENCE_DATA_SOURCE_FIELD}\` 字段（承载原 \`supported_by\` 语义），` +
            `经 evidenceId 回链到 \`evidence\` 表；某对象若无 evidenceLink，则回退到 \`supported_by\` 关系并标注来源字段。`
        : `快照未提供 \`${EVIDENCE_DATA_SOURCE_FIELD}\`，本报告回退到 \`modelRelation(supported_by)\` 表达证据` +
            `（待 evidence 拆分后切换到 \`${EVIDENCE_DATA_SOURCE_FIELD}\`）。`,
      'note',
    ),
  );
  const problems = objectsOfKind(bundle, 'problem');
  for (const problem of problems) {
    blocks.push(
      objectRef({
        type: 'objectRef',
        code: problem.code,
        kind: problem.kind,
        title: problem.title,
        state: problem.state,
        note: `影响：${String(problem.payload.impact ?? '—')}`,
      }),
    );

    const direct = evidenceLinks.filter((l) => l.objectId === problem.id);
    if (direct.length > 0) {
      blocks.push(
        table(
          `${problem.code} 证据链接（来源字段 ${EVIDENCE_DATA_SOURCE_FIELD}）`,
          ['证据编号', '证据类型', '定位', '提供者', '最小引用', '用途'],
          direct.map((l) => {
            const ev = evidenceById.get(l.evidenceId);
            return [
              l.evidenceId,
              ev ? ev.type : '（未知证据）',
              ev ? ev.locator : '—',
              ev ? ev.provider : '—',
              l.excerpt,
              l.purpose,
            ];
          }),
          direct.map((l) => l.evidenceId),
        ),
      );
      continue;
    }

    // 回退路径：supported_by 关系（旧结构）
    const supportedBy = bundle.modelRelation.filter(
      (r) => r.kind === 'supported_by' && (r.fromId === problem.id || r.toId === problem.id),
    );
    if (supportedBy.length === 0) {
      blocks.push(
        paragraph(`${problem.code} 暂无证据（既无 ${EVIDENCE_DATA_SOURCE_FIELD} 也无 supported_by）。`, 'note'),
      );
      continue;
    }
    blocks.push(
      table(
        `${problem.code} 证据（来源字段 modelRelation.supported_by，待 evidence 拆分后切换）`,
        ['关系编号', '证据对象编号', '证据对象名称', '类型'],
        supportedBy.map((r) => {
          const otherId = r.fromId === problem.id ? r.toId : r.fromId;
          const other = objectsById.get(otherId);
          return [r.id, other?.code ?? otherId, other?.title ?? '—', other ? kindLabel(other.kind) : '—'];
        }),
        supportedBy.map((r) => r.id),
      ),
    );
  }

  // ---------- 4 目标需求与追溯 ----------
  blocks.push(heading(num.nextMajor(), '目标需求与追溯', 1));
  const requirements = objectsOfKind(bundle, 'requirement');
  blocks.push(
    paragraph(
      '每条需求列出来源（derived_from）对象编号，可回链回问题/现状事实/目标。',
      'note',
    ),
  );
  blocks.push(
    table(
      '需求清单（REQ-*）',
      ['编号', '需求', '优先级', '状态', '来源（derived_from）'],
      requirements.map((o) => [
        o.code,
        o.title,
        String(o.payload.priority ?? '—'),
        stateLabel(o.state),
        rel
          .outgoing(o.id, 'derived_from')
          .map((r) => {
            const src = objectsById.get(r.toId);
            return src ? `${src.code}（${src.title}）` : r.toId;
          })
          .join('；') || '—',
      ]),
      requirements.map((o) => o.code),
    ),
  );
  for (const req of requirements) {
    const sources = rel
      .outgoing(req.id, 'derived_from')
      .map((r) => {
        const src = objectsById.get(r.toId);
        return src ? `${src.code}` : r.toId;
      })
      .join('、');
    blocks.push(
      objectRef({
        type: 'objectRef',
        code: req.code,
        kind: req.kind,
        title: req.title,
        state: req.state,
        note: `来源(derived_from)：${sources || '—'}；优先级 priority=${String(
          req.payload.priority ?? '—',
        )}`,
      }),
    );
  }

  // ---------- 附录 A 对象编号索引 ----------
  blocks.push(heading('附录 A', '对象编号索引', 1));
  blocks.push(
    paragraph(
      `全量 ${bundle.modelObject.length} 个模型对象及其稳定编号（用于图文一致性反向校验）。`,
      'note',
    ),
  );
  const allObjects = sortByCode(bundle.modelObject);
  blocks.push(
    table(
      '对象编号索引（全量）',
      ['编号', '类型', '名称', '状态', '来源'],
      allObjects.map((o) => [
        o.code,
        kindLabel(o.kind),
        o.title,
        stateLabel(o.state),
        sourceLabel(o.sourceStatus),
      ]),
      allObjects.map((o) => o.code),
    ),
  );

  const ir: DocumentIr = {
    irVersion: DOCUMENT_IR_VERSION,
    templateVersion,
    metadata: {
      projectId: bundle.projectId,
      projectRevision: bundle.projectRevision,
      snapshotSha256,
      generatedAt: options.generatedAt,
      templateVersion,
      documentStatus: 'draft',
      watermark: DRAFT_WATERMARK,
      dataSource: 'packages/testkit/fixtures/demo-trade/model-bundle.json',
    },
    blocks,
  };

  return assertValidDocumentIr(ir);
}
