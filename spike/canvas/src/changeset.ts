/**
 * ChangeSet / ChangeOperation 形状（对应实施方案 §5.3 写入单一入口）。
 *
 * 关键点：
 * - ChangeSet 是**语义变更**的载体，而不是 React Flow JSON。
 * - 每条 operation 必须携带 `sourceRefs` 与 `confidenceState`（P4 事实与推断分离）。
 * - 布局拖动只在短时间内合并为 `view_layout_patch`，**不产生 revision**（ADR-003 决策第 4 条）。
 */
import type { ModelObject, SourceStatus } from './domain';

/** ChangeSet 的两类来源：语义变更 vs 纯布局补丁。 */
export type ChangeSetKind = 'semantic' | 'view_layout_patch';

export type ChangeSourceType =
  'user_action' | 'object' | 'relation' | 'evidence' | 'agent_draft' | 'view';

export interface ChangeSource {
  type: ChangeSourceType;
  referenceIds: string[];
}

export type OperationTargetType =
  'model_object' | 'model_relation' | 'view_layout' | 'evidence_link';

export type OperationKind = 'create' | 'update' | 'delete';

export interface ChangeOperation {
  operationId: string;
  op: OperationKind;
  targetType: OperationTargetType;
  /** 已存在对象走 targetId；新建对象走 tempId（由服务端映射为真实 ID）。 */
  targetId?: string;
  tempId?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  sourceRefs: ChangeSource[];
  confidenceState: SourceStatus;
}

export interface ChangeSet {
  changeSetId: string;
  projectId: string;
  /** 乐观锁基线：必须与服务端当前 revision 匹配（If-Match）。 */
  basedOnRevision: number;
  kind: ChangeSetKind;
  reason: string;
  source: ChangeSource;
  operations: ChangeOperation[];
  createdAt: string;
  /** 布局补丁不落 revision；语义变更落 revision。 */
  bumpsRevision: boolean;
}

let opCounter = 0;

/** 生成客户端 operationId（仅供 UI 侧关联；服务端可再派生稳定 ID）。 */
export function nextOperationId(prefix = 'op'): string {
  opCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${opCounter.toString(36).padStart(3, '0')}`;
}

let csCounter = 0;

/** 生成客户端 changeSetId。 */
export function nextChangeSetId(): string {
  csCounter += 1;
  return `cs-${Date.now().toString(36)}-${csCounter.toString(36).padStart(3, '0')}`;
}

/** 拖动节点 → `view_layout` 更新操作（不落 revision）。 */
export function layoutDragOperation(input: {
  objectId: string;
  viewId: string;
  layoutId: string | null;
  from: { x: number; y: number };
  to: { x: number; y: number };
  locked?: boolean;
}): ChangeOperation {
  const targetId = input.layoutId ?? `${input.viewId}:${input.objectId}`;
  return {
    operationId: nextOperationId('oplay'),
    op: 'update',
    targetType: 'view_layout',
    targetId,
    before: { x: input.from.x, y: input.from.y },
    after: { x: input.to.x, y: input.to.y, locked: input.locked ?? false },
    sourceRefs: [{ type: 'user_action', referenceIds: [input.objectId] }],
    confidenceState: 'user_statement',
  };
}

/**
 * 修改 title → `model_object` 更新操作（落 revision）。
 * sourceRefs 取自该对象的真实 evidenceLink（若存在），否则回退为 user_action。
 */
export function titleUpdateOperation(input: {
  object: ModelObject;
  nextTitle: string;
  sourceRefs: ChangeSource[];
}): ChangeOperation {
  return {
    operationId: nextOperationId('opobj'),
    op: 'update',
    targetType: 'model_object',
    targetId: input.object.id,
    before: { title: input.object.title },
    after: { title: input.nextTitle },
    sourceRefs:
      input.sourceRefs.length > 0
        ? input.sourceRefs
        : [{ type: 'user_action', referenceIds: [input.object.id] }],
    confidenceState: input.object.sourceStatus,
  };
}

export function createChangeSet(input: {
  projectId: string;
  basedOnRevision: number;
  kind: ChangeSetKind;
  reason: string;
  source: ChangeSource;
  operations: ChangeOperation[];
}): ChangeSet {
  return {
    changeSetId: nextChangeSetId(),
    projectId: input.projectId,
    basedOnRevision: input.basedOnRevision,
    kind: input.kind,
    reason: input.reason,
    source: input.source,
    operations: input.operations,
    createdAt: new Date().toISOString(),
    bumpsRevision: input.kind === 'semantic',
  };
}

/** 序列化为 2 空格缩进的 JSON（页面/控制台输出用）。 */
export function serializeChangeSet(changeSet: ChangeSet): string {
  return JSON.stringify(changeSet, null, 2);
}
