import { z } from 'zod';

/**
 * 统一 ModelBundle 的运行时 Schema（zod）。
 *
 * 对应实施方案 §4.2 关键表设计要点：
 * - `model_object`（事实主链核心）
 * - `model_relation`
 * - `view` / `view_layout`
 * - `project_revision`
 *
 * 该 Schema 是「金样例」`demo-trade` / `demo-manufacturing` 的唯一契约来源，
 * 也是 M0 四个 Spike（2D / 3D / Agent 草案 / 文档）的共同输入。
 */

/** 对象 kind：与 model_object.kind 枚举一致（§4.2）。 */
export const objectKindSchema = z.enum([
  'role',
  'person',
  'organization',
  'activity',
  'decision',
  'start',
  'end',
  'parallel',
  'wait',
  'subprocess',
  'exception',
  'system',
  'data_object',
  'current_fact',
  'problem',
  'target',
  'requirement',
  'solution_candidate',
  'term',
]);

/** 对象状态：与 model_object.state 枚举一致（§4.2）。 */
export const objectStateSchema = z.enum([
  'draft',
  'pending_confirmation',
  'needs_change',
  'confirmed',
  'approved',
  'deprecated',
]);

/** 来源状态：用于验证「事实与推断分离」（§4.2 / §6.3）。 */
export const sourceStatusSchema = z.enum([
  'user_statement',
  'material_extracted',
  'consultant_judgment',
  'agent_inference',
  'confirmed_fact',
  'approved_requirement',
]);

/** 关系 kind：与 model_relation.kind 枚举一致（§4.2）。 */
export const relationKindSchema = z.enum([
  'belongs_to',
  'performs_R',
  'accountable_A',
  'consulted_C',
  'informed_I',
  'flow_to',
  'triggers',
  'consumes',
  'produces',
  'uses_system',
  'has_exception',
  'supported_by',
  'derived_from',
  'resolves',
  'maps_to',
  'confirms',
  'replaces',
]);

const payloadSchema = z.record(z.string(), z.unknown());

/** model_object：事实主链核心。 */
export const modelObjectSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  kind: objectKindSchema,
  code: z.string().min(1),
  title: z.string(),
  state: objectStateSchema,
  sourceStatus: sourceStatusSchema,
  objectRev: z.number().int().nonnegative(),
  payload: payloadSchema,
});

/** model_relation：端点必须存在且未废止（由 validate-bundle 校验）。 */
export const modelRelationSchema = z.object({
  id: z.string().min(1),
  kind: relationKindSchema,
  fromId: z.string().min(1),
  toId: z.string().min(1),
  /** 可选：分支/流转条件标签（decision 出口必须非空，见 DECISION_NO_CONDITION）。 */
  label: z.string().optional(),
  payload: payloadSchema.optional(),
});

/** view：视图（流程 / RACI / 证据 / 总览）。 */
export const viewSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['process', 'raci', 'evidence', 'overview']).optional(),
  isDefault: z.boolean().optional(),
});

/** view_layout：视图内对象的画布坐标（按 role 泳道）。 */
export const viewLayoutSchema = z.object({
  id: z.string().min(1),
  viewId: z.string().min(1),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  /** 泳道标识（通常为角色 code）。 */
  lane: z.string().optional(),
  locked: z.boolean(),
});

/**
 * evidence：独立实体（实施方案 §4.1「调研与证据」分表存放；分级脱敏见 §7.4「导出」）。
 * 证据与模型对象分表存放，拥有独立的对象级权限与数据分级，
 * 不复用 `data_object`，以便 M7/M8 承载分级与脱敏。
 */
export const evidenceTypeSchema = z.enum([
  'interview_segment',
  'form_sample',
  'screenshot',
  'policy_doc',
  'audio_recording',
  'document',
]);

/** 数据级别（实施方案 §7.4「导出」分类策略与脱敏）。 */
export const evidenceClassificationSchema = z.enum([
  'project_public',
  'internal',
  'sensitive',
  'highly_sensitive',
]);

export const evidenceSchema = z.object({
  id: z.string().min(1),
  type: evidenceTypeSchema,
  /** 来源定位：文件+页码或录音时间段。 */
  locator: z.string().min(1),
  /** 提供者：用岗位/角色，禁止真实姓名。 */
  provider: z.string().min(1),
  capturedAt: z.string().min(1),
  classification: evidenceClassificationSchema,
});

/** evidence_link：证据到模型对象的关联（实施方案 §4.1「调研与证据」），承载原 `supported_by` 语义。 */
export const evidenceLinkSchema = z.object({
  id: z.string().min(1),
  evidenceId: z.string().min(1),
  objectId: z.string().min(1),
  /** 最小引用片段，不得整段复制材料。 */
  excerpt: z.string(),
  purpose: z.string().min(1),
});

/** ModelBundle：一次可复现的模型快照（对应 project_revision）。 */
export const modelBundleSchema = z.object({
  projectId: z.string().min(1),
  projectRevision: z.number().int().nonnegative(),
  modelObject: z.array(modelObjectSchema),
  modelRelation: z.array(modelRelationSchema),
  view: z.array(viewSchema),
  viewLayout: z.array(viewLayoutSchema),
  evidence: z.array(evidenceSchema),
  evidenceLink: z.array(evidenceLinkSchema),
});

export type ObjectKind = z.infer<typeof objectKindSchema>;
export type ObjectState = z.infer<typeof objectStateSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type RelationKind = z.infer<typeof relationKindSchema>;
export type ModelObject = z.infer<typeof modelObjectSchema>;
export type ModelRelation = z.infer<typeof modelRelationSchema>;
export type View = z.infer<typeof viewSchema>;
export type ViewLayout = z.infer<typeof viewLayoutSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type EvidenceClassification = z.infer<typeof evidenceClassificationSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type ModelBundle = z.infer<typeof modelBundleSchema>;

/** 解析并校验一个未知输入是否为合法 ModelBundle。 */
export function parseModelBundle(input: unknown): ModelBundle {
  return modelBundleSchema.parse(input);
}
