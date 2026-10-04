import { z } from 'zod';

/**
 * SceneProjection：3D 导览与 2D 故事视图共享的**只读展示模型**（ADR-004 / 实施方案 §7.1）。
 *
 * 设计约束（不可妥协）：
 * - 投影由 ModelBundle 经**确定性投影器**生成，同一输入必须产出逐字节一致的输出。
 * - 坐标（position / size / points）属**展示布局**，严禁回写业务语义（§4.2 `view_layout` 只存展示）。
 * - 3D 不承载独占信息：所有实体都能在 `text-equivalent` 中以列表文本等价表达。
 * - `steps` / `cards` 供 3D 与 2D 共用，WebGL 不可用时 2D 保留同一份步骤、旁白、对象卡。
 */

export const SCENE_PROJECTION_SCHEMA_VERSION = 'scene-projection/1' as const;

/** 展示布局中的三维坐标（右手中坐标，单位：米，仅为展示）。 */
export const sceneVector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

/** 区域：按 `role.payload.department` 归并；无部门时归入「未分组」。 */
export const sceneRegionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  department: z.string().min(1),
  roleObjectIds: z.array(z.string().min(1)),
  actorIds: z.array(z.string().min(1)),
  position: sceneVector3Schema,
  size: sceneVector3Schema,
});

/** 演员：来自 `kind=role` 的对象。 */
export const sceneActorSchema = z.object({
  id: z.string().min(1),
  sourceObjectId: z.string().min(1),
  code: z.string().min(1),
  label: z.string(),
  department: z.string().min(1),
  regionId: z.string().min(1),
  position: sceneVector3Schema,
});

/** 站点种类：流程节点 kind（保证 `paths` 的 flow_to 端点完整）。 */
export const sceneStationKindSchema = z.enum([
  'start',
  'activity',
  'decision',
  'parallel',
  'wait',
  'subprocess',
  'exception',
  'end',
]);

/** 站点：来自 `kind=activity` 为主的流程节点对象。 */
export const sceneStationSchema = z.object({
  id: z.string().min(1),
  sourceObjectId: z.string().min(1),
  code: z.string().min(1),
  label: z.string(),
  stationKind: sceneStationKindSchema,
  regionId: z.string().min(1),
  /** 主责演员：优先 `accountable_A`，其次 `performs_R`；都缺失时为 null。 */
  actorId: z.string().min(1).nullable(),
  /** 流程拓扑顺序（从 start 出发的稳定 BFS 序号）。 */
  order: z.number().int().nonnegative(),
  position: sceneVector3Schema,
});

/** 路径：来自 `flow_to`，携带分支/条件 `label`。 */
export const scenePathSchema = z.object({
  id: z.string().min(1),
  sourceRelationId: z.string().min(1),
  fromStationId: z.string().min(1),
  toStationId: z.string().min(1),
  label: z.string().nullable(),
  condition: z.string().nullable(),
  points: z.array(sceneVector3Schema),
});

/** 问题：来自 `kind=problem`。 */
export const sceneIssueSchema = z.object({
  id: z.string().min(1),
  sourceObjectId: z.string().min(1),
  code: z.string().min(1),
  label: z.string(),
  impact: z.string().nullable(),
  relatedRequirementIds: z.array(z.string().min(1)),
  position: sceneVector3Schema,
});

/** 交付物：来自 `kind=data_object`。 */
export const sceneArtifactSchema = z.object({
  id: z.string().min(1),
  sourceObjectId: z.string().min(1),
  code: z.string().min(1),
  label: z.string(),
  docType: z.string().nullable(),
  producedByStationIds: z.array(z.string().min(1)),
  consumedByStationIds: z.array(z.string().min(1)),
  position: sceneVector3Schema,
});

export const sceneStepFocusKindSchema = z.enum(['overview', 'station', 'issue']);

/** 故事步骤：3D 导览与 2D 故事视图共用同一序列。 */
export const sceneStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  narration: z.string().min(1),
  focusKind: sceneStepFocusKindSchema,
  focusId: z.string().min(1),
  stationId: z.string().min(1).nullable(),
});

/** 对象卡：通俗说明，供拾取弹卡与 2D 列表复用。 */
export const sceneCardSchema = z.object({
  id: z.string().min(1),
  objectId: z.string().min(1),
  kind: z.string().min(1),
  code: z.string().min(1),
  title: z.string(),
  summary: z.string().min(1),
});

/** 场景集合（3D 与 2D 共用的展示数据，属「scene 数据」而非元数据）。 */
const sceneCollectionsShape = {
  regions: z.array(sceneRegionSchema),
  actors: z.array(sceneActorSchema),
  stations: z.array(sceneStationSchema),
  paths: z.array(scenePathSchema),
  issues: z.array(sceneIssueSchema),
  artifacts: z.array(sceneArtifactSchema),
  steps: z.array(sceneStepSchema),
  cards: z.array(sceneCardSchema),
};

/**
 * SceneProjection 顶层契约：**纯投影**，只由 ModelBundle 决定。
 * 不包含来源元数据（如源 bundle 哈希），因此投影器是 ModelBundle 的纯函数，可严格判等。
 */
export const sceneProjectionSchema = z.object({
  schemaVersion: z.literal(SCENE_PROJECTION_SCHEMA_VERSION),
  projectId: z.string().min(1),
  projectRevision: z.number().int().nonnegative(),
  ...sceneCollectionsShape,
});

/**
 * 产物（artifact）契约：在 SceneProjection 之上追加**元数据区** `sourceBundleSha256`，
 * 与 `projectRevision` 并列，用于自证产物源自冻结基线。
 *
 * 该哈希必须在写入时从源 ModelBundle 原始字节**重算**得到，禁止从常量抄写；
 * 因此不属于纯投影，独立于 `sceneProjectionSchema`。
 */
export const sceneProjectionArtifactSchema = z.object({
  schemaVersion: z.literal(SCENE_PROJECTION_SCHEMA_VERSION),
  projectId: z.string().min(1),
  projectRevision: z.number().int().nonnegative(),
  sourceBundleSha256: z.string().regex(/^[0-9a-f]{64}$/),
  ...sceneCollectionsShape,
});

export type SceneVector3 = z.infer<typeof sceneVector3Schema>;
export type SceneRegion = z.infer<typeof sceneRegionSchema>;
export type SceneActor = z.infer<typeof sceneActorSchema>;
export type SceneStationKind = z.infer<typeof sceneStationKindSchema>;
export type SceneStation = z.infer<typeof sceneStationSchema>;
export type ScenePath = z.infer<typeof scenePathSchema>;
export type SceneIssue = z.infer<typeof sceneIssueSchema>;
export type SceneArtifact = z.infer<typeof sceneArtifactSchema>;
export type SceneStep = z.infer<typeof sceneStepSchema>;
export type SceneCard = z.infer<typeof sceneCardSchema>;
export type SceneProjection = z.infer<typeof sceneProjectionSchema>;
export type SceneProjectionArtifact = z.infer<typeof sceneProjectionArtifactSchema>;

/** 解析并校验一个未知输入是否为合法 SceneProjection。 */
export function parseSceneProjection(input: unknown): SceneProjection {
  return sceneProjectionSchema.parse(input);
}

/** 解析并校验一个未知输入是否为合法 SceneProjection 产物（含来源哈希元数据）。 */
export function parseSceneProjectionArtifact(input: unknown): SceneProjectionArtifact {
  return sceneProjectionArtifactSchema.parse(input);
}

/** SceneProjection 各集合的对象计数（用于证据与漂移校验）。 */
export interface SceneProjectionCounts {
  regions: number;
  actors: number;
  stations: number;
  paths: number;
  issues: number;
  artifacts: number;
  steps: number;
  cards: number;
}

export function countSceneProjection(projection: SceneProjection): SceneProjectionCounts {
  return {
    regions: projection.regions.length,
    actors: projection.actors.length,
    stations: projection.stations.length,
    paths: projection.paths.length,
    issues: projection.issues.length,
    artifacts: projection.artifacts.length,
    steps: projection.steps.length,
    cards: projection.cards.length,
  };
}
