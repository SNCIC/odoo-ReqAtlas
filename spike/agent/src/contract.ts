import type { SourceStatus } from '@reqatlas/testkit';

/**
 * 契约类型（**只作 TS 便利类型**）。
 *
 * 权威来源是 `docs/api/schemas/*.json`：所有运行时校验一律走 Schema Guard（ajv）直接消费该目录，
 * 本文件不复制任何校验逻辑、不维护第二份 JSON Schema。
 *
 * 字段与枚举以契约为准；`confidenceState` 直接复用 `@reqatlas/testkit` 导出的
 * `sourceStatusSchema` 派生类型，避免复制来源枚举。
 */

/** §4.2 source_status：与 testkit `sourceStatusSchema` 同源。 */
export type ConfidenceState = SourceStatus;

export type OperationKind = 'create' | 'update' | 'delete' | 'link';
export type ChangeTargetType = 'model_object' | 'model_relation' | 'view' | 'view_layout';
export type FindingSeverity = 'block' | 'error' | 'warn';
export type SourceRefType =
  | 'user_input'
  | 'evidence'
  | 'object'
  | 'material'
  | 'knowledge'
  | 'template';
export type ScopeType = 'object' | 'scenario' | 'project';
export type DraftIntent = 'create' | 'modify' | 'explain' | 'check' | 'document';
export type AgentTask =
  | 'build_model'
  | 'generate_questions'
  | 'check_completeness'
  | 'explain'
  | 'generate_storyline';
export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'needs_input'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type ChangeSourceType = 'manual' | 'agent' | 'import' | 'template' | 'migration';

export interface Scope {
  type: ScopeType;
  id: string;
}

export interface SourceRef {
  type: SourceRefType;
  id: string;
}

/** 领域校验命中的统一结构（见 docs/api/domain-rules.md §1）。 */
export interface Finding {
  ruleCode: string;
  severity: FindingSeverity;
  objectIds: string[];
  message: string;
}

export interface DraftChange {
  operationId: string;
  op: OperationKind;
  targetType: ChangeTargetType;
  targetId?: string;
  tempId?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  sourceRefs: SourceRef[];
  confidenceState: ConfidenceState;
}

export interface DraftQuestion {
  id?: string;
  text: string;
  reason?: string;
  blocking?: boolean;
}

export interface DraftValidation {
  blocking: Finding[];
  warnings: Finding[];
}

/** Agent 结构化输出契约（docs/api/schemas/change-draft.json）。 */
export interface ChangeDraft {
  draftId: string;
  basedOnRevision: number;
  scope: Scope;
  intent: DraftIntent;
  assumptions: string[];
  questions?: DraftQuestion[];
  changes?: DraftChange[];
  sources: SourceRef[];
  validation: DraftValidation;
  summary: string;
}

/** ChangeSet 的操作与草案 change 同形（change-set.json#/$defs/operation）。 */
export type ChangeSetOperation = DraftChange;

export interface ChangeSetSource {
  type: ChangeSourceType;
  referenceIds: string[];
}

/** 模型写入的唯一凭证（docs/api/schemas/change-set.json）。 */
export interface ChangeSet {
  reason: string;
  source: ChangeSetSource;
  operations: ChangeSetOperation[];
}

export interface AgentRunInput {
  text: string;
  selectedObjectIds?: string[];
}

export interface AgentRunOptions {
  allowAssumptions?: boolean;
  maxQuestions?: number;
}

/** Agent 任务请求契约（docs/api/schemas/agent-run.json 根 schema）。 */
export interface AgentRunRequest {
  task: AgentTask;
  scope: Scope;
  input: AgentRunInput;
  options?: AgentRunOptions;
}

/** AgentRun 响应状态机（agent-run.json#/$defs/AgentRun）。 */
export interface AgentRun {
  id: string;
  task: AgentTask;
  scope: Scope;
  status: AgentRunStatus;
  draftId?: string;
  questions?: string[];
  error?: { code: string; message: string };
  createdAt?: string;
  updatedAt?: string;
}

/** RFC 9457 application/problem+json（docs/api/schemas/problem.json）。 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  requestId: string;
  context?: Record<string, unknown>;
}
