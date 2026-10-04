import {
  modelBundleSchema,
  objectKindSchema,
  objectStateSchema,
  relationKindSchema,
  sourceStatusSchema,
  type ModelBundle,
  type ModelObject,
  type ModelRelation,
} from '@reqatlas/testkit';
import type { ChangeDraft, Finding } from '../contract';

/**
 * 把草案的 changes 投影到 bundle 的**深拷贝**上（绝不动原始 bundle），
 * 得到「若应用后」的项目状态，并对无法投影的操作产出结构性 finding。
 */

export interface ProjectionOptions {
  /** 已知的跨项目对象索引：id → projectId（用于 CROSS_PROJECT_REFERENCE）。 */
  foreignProjectById?: ReadonlyMap<string, string>;
}

export interface ProjectionResult {
  projected: ModelBundle;
  tempToId: Map<string, string>;
  structuralFindings: Finding[];
  appliedOperationIds: string[];
  /** 投影是否产出结构合法的 ModelBundle（决定能否跑跨对象语义校验）。 */
  bundleParseable: boolean;
}

const objectKinds: readonly string[] = objectKindSchema.options;
const objectStates: readonly string[] = objectStateSchema.options;
const sourceStatuses: readonly string[] = sourceStatusSchema.options;
const relationKinds: readonly string[] = relationKindSchema.options;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function finding(
  ruleCode: string,
  severity: Finding['severity'],
  objectIds: string[],
  message: string,
): Finding {
  return { ruleCode, severity, objectIds, message };
}

const OBJECT_MERGE_FIELDS = ['kind', 'code', 'title', 'state', 'sourceStatus', 'payload'] as const;

export function projectDraft(
  draft: ChangeDraft,
  bundle: ModelBundle,
  options: ProjectionOptions = {},
): ProjectionResult {
  const objects: ModelObject[] = clone(bundle.modelObject);
  const relations: ModelRelation[] = clone(bundle.modelRelation);
  const objectsById = new Map<string, ModelObject>(objects.map((o) => [o.id, o]));
  const relationsById = new Map<string, ModelRelation>(relations.map((r) => [r.id, r]));
  const structuralFindings: Finding[] = [];
  const appliedOperationIds: string[] = [];
  const tempToId = new Map<string, string>();
  const foreign = options.foreignProjectById ?? new Map<string, string>();

  const changes = draft.changes ?? [];
  // 预扫描：同一草案内声明的新建临时 ID（tempId 在草案内解析）。
  const declaredTempIds = new Set<string>();
  for (const c of changes) {
    if (c.tempId !== undefined) declaredTempIds.add(c.tempId);
  }

  const resolveObjectRef = (id: string): { ok: true; projectId: string } | { ok: false; reason: string } => {
    const existing = objectsById.get(id);
    if (existing) return { ok: true, projectId: existing.projectId };
    const foreignProject = foreign.get(id);
    if (foreignProject !== undefined) {
      return { ok: false, reason: `对象 ${id} 属于其他项目 ${foreignProject}` };
    }
    if (declaredTempIds.has(id)) return { ok: true, projectId: bundle.projectId };
    return { ok: false, reason: `对象 ${id} 不存在` };
  };

  for (const change of changes) {
    const isFactOperation = change.op !== 'delete';
    if (isFactOperation && (change.sourceRefs?.length ?? 0) === 0) {
      structuralFindings.push(
        finding(
          'SOURCE_REQUIRED',
          'block',
          [change.targetId ?? change.tempId ?? change.operationId],
          `操作 ${change.operationId}（${change.op}）为事实型操作，但 sourceRefs 为空，不得进入基线。`,
        ),
      );
    }

    if (change.targetType === 'model_object') {
      if (change.op === 'create') {
        const after = asRecord(change.after);
        if (!after) {
          structuralFindings.push(
            finding('INVALID_OPERATION', 'block', [change.operationId], `create 操作缺少 after 对象。`),
          );
          continue;
        }
        const kind = asString(after.kind);
        const code = asString(after.code);
        const title = asString(after.title);
        const state = asString(after.state);
        const sourceStatus = asString(after.sourceStatus);
        const invalid: string[] = [];
        if (kind === undefined || !objectKinds.includes(kind)) invalid.push(`kind=${String(kind)}`);
        if (state === undefined || !objectStates.includes(state)) invalid.push(`state=${String(state)}`);
        if (sourceStatus === undefined || !sourceStatuses.includes(sourceStatus)) {
          invalid.push(`sourceStatus=${String(sourceStatus)}`);
        }
        if (invalid.length > 0) {
          structuralFindings.push(
            finding(
              'UNKNOWN_ENUM',
              'block',
              [change.tempId ?? change.operationId],
              `create 操作含未知/缺失枚举：${invalid.join('、')}。`,
            ),
          );
          continue;
        }
        const productId = asString(after.projectId) ?? bundle.projectId;
        if (productId !== bundle.projectId) {
          structuralFindings.push(
            finding(
              'CROSS_PROJECT_REFERENCE',
              'block',
              [change.tempId ?? change.operationId],
              `create 操作引用其他项目 projectId=${productId}（当前 ${bundle.projectId}）。`,
            ),
          );
          continue;
        }
        const id = change.tempId ?? change.operationId;
        const object: ModelObject = {
          id,
          projectId: productId,
          kind: kind as ModelObject['kind'],
          code: code ?? id,
          title: title ?? id,
          state: state as ModelObject['state'],
          sourceStatus: sourceStatus as ModelObject['sourceStatus'],
          objectRev: 0,
          payload: asRecord(after.payload) ?? {},
        };
        objects.push(object);
        objectsById.set(id, object);
        if (change.tempId !== undefined) tempToId.set(change.tempId, id);
        appliedOperationIds.push(change.operationId);
      } else if (change.op === 'update') {
        const targetId = change.targetId;
        if (targetId !== undefined && foreign.has(targetId)) {
          structuralFindings.push(
            finding(
              'CROSS_PROJECT_REFERENCE',
              'block',
              [targetId, change.operationId],
              `update 引用的对象 ${targetId} 属于其他项目 ${foreign.get(targetId)}。`,
            ),
          );
          continue;
        }
        const existing = targetId !== undefined ? objectsById.get(targetId) : undefined;
        if (!existing) {
          structuralFindings.push(
            finding(
              'DANGLING_REFERENCE',
              'block',
              [targetId ?? change.operationId],
              `update 操作引用了不存在的对象 targetId=${String(targetId)}。`,
            ),
          );
          continue;
        }
        const after = asRecord(change.after);
        if (after) {
          for (const field of OBJECT_MERGE_FIELDS) {
            if (after[field] !== undefined) {
              (existing as unknown as Record<string, unknown>)[field] = after[field];
            }
          }
        }
        appliedOperationIds.push(change.operationId);
      } else if (change.op === 'delete') {
        const targetId = change.targetId;
        const existing = targetId !== undefined ? objectsById.get(targetId) : undefined;
        if (!existing) {
          structuralFindings.push(
            finding(
              'DANGLING_REFERENCE',
              'block',
              [targetId ?? change.operationId],
              `delete 操作引用了不存在的对象 targetId=${String(targetId)}。`,
            ),
          );
          continue;
        }
        const idx = objects.indexOf(existing);
        if (idx >= 0) objects.splice(idx, 1);
        objectsById.delete(existing.id);
        appliedOperationIds.push(change.operationId);
      }
      continue;
    }

    if (change.targetType === 'model_relation') {
      if (change.op === 'create' || change.op === 'link') {
        const after = asRecord(change.after);
        if (!after) {
          structuralFindings.push(
            finding(
              'INVALID_OPERATION',
              'block',
              [change.operationId],
              `${change.op} 关系操作缺少 after 对象。`,
            ),
          );
          continue;
        }
        const kind = asString(after.kind);
        if (kind === undefined || !relationKinds.includes(kind)) {
          structuralFindings.push(
            finding(
              'UNKNOWN_ENUM',
              'block',
              [change.tempId ?? change.operationId],
              `关系操作含未知 kind=${String(kind)}。`,
            ),
          );
          continue;
        }
        const fromId = asString(after.fromId) ?? '';
        const toId = asString(after.toId) ?? '';
        const fromRef = resolveObjectRef(fromId);
        const toRef = resolveObjectRef(toId);
        if (!fromRef.ok || !toRef.ok) {
          const reasons = [fromRef.ok ? '' : fromRef.reason, toRef.ok ? '' : toRef.reason]
            .filter((s) => s.length > 0)
            .join('；');
          structuralFindings.push(
            finding(
              'DANGLING_REFERENCE',
              'block',
              [change.tempId ?? change.operationId, fromId, toId],
              `关系 ${change.operationId} 端点悬空：${reasons || '未知端点'}。`,
            ),
          );
          continue;
        }
        if (foreign.has(fromId) || foreign.has(toId)) {
          structuralFindings.push(
            finding(
              'CROSS_PROJECT_REFERENCE',
              'block',
              [change.operationId, fromId, toId],
              `关系 ${change.operationId} 引用了其他项目的对象。`,
            ),
          );
          continue;
        }
        const id = change.tempId ?? change.operationId;
        const relation: ModelRelation = {
          id,
          kind: kind as ModelRelation['kind'],
          fromId,
          toId,
          ...(asString(after.label) !== undefined ? { label: asString(after.label)! } : {}),
          ...(asRecord(after.payload) !== undefined ? { payload: asRecord(after.payload)! } : {}),
        };
        relations.push(relation);
        relationsById.set(id, relation);
        if (change.tempId !== undefined) tempToId.set(change.tempId, id);
        appliedOperationIds.push(change.operationId);
      } else if (change.op === 'update') {
        const targetId = change.targetId;
        const existing = targetId !== undefined ? relationsById.get(targetId) : undefined;
        if (!existing) {
          structuralFindings.push(
            finding(
              'DANGLING_REFERENCE',
              'block',
              [targetId ?? change.operationId],
              `关系 update 引用了不存在的 targetId=${String(targetId)}。`,
            ),
          );
          continue;
        }
        const after = asRecord(change.after);
        if (after) {
          if (asString(after.label) !== undefined) existing.label = asString(after.label);
          if (asRecord(after.payload) !== undefined) existing.payload = asRecord(after.payload);
        }
        appliedOperationIds.push(change.operationId);
      } else if (change.op === 'delete') {
        const targetId = change.targetId;
        const existing = targetId !== undefined ? relationsById.get(targetId) : undefined;
        if (!existing) {
          structuralFindings.push(
            finding(
              'DANGLING_REFERENCE',
              'block',
              [targetId ?? change.operationId],
              `关系 delete 引用了不存在的 targetId=${String(targetId)}。`,
            ),
          );
          continue;
        }
        const idx = relations.indexOf(existing);
        if (idx >= 0) relations.splice(idx, 1);
        relationsById.delete(existing.id);
        appliedOperationIds.push(change.operationId);
      }
    }
  }

  const candidateBundle: ModelBundle = {
    ...bundle,
    modelObject: objects,
    modelRelation: relations,
  };
  const parsed = modelBundleSchema.safeParse(candidateBundle);
  const bundleParseable = parsed.success;
  if (!bundleParseable) {
    structuralFindings.push(
      finding(
        'PROJECTION_INVALID',
        'block',
        [],
        '投影结果不满足 ModelBundle Schema，无法继续跨对象语义校验。',
      ),
    );
  }

  return {
    projected: candidateBundle,
    tempToId,
    structuralFindings,
    appliedOperationIds,
    bundleParseable,
  };
}
