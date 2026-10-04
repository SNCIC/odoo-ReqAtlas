import type { ModelBundle, ModelObject, ModelRelation } from '@reqatlas/testkit';
import type { Scope } from '../contract';
import type { ProviderCandidate, ProviderMessage } from '../provider/types';
import type { Retriever } from '../retriever/retriever';

/** 权限过滤：只允许这些对象进入上下文（缺省表示不额外限制）。 */
export interface ContextPermissions {
  allowedObjectIds?: ReadonlySet<string>;
}

export interface ContextRequestInput {
  text: string;
  selectedObjectIds?: readonly string[];
}

export interface ContextRequest {
  bundle: ModelBundle;
  scope: Scope;
  task: string;
  input: ContextRequestInput;
  tokenBudget: number;
  permissions?: ContextPermissions;
  retriever: Retriever;
}

/** Context Builder 产物：最小上下文 + 实际发往 Provider 的消息。 */
export interface ContextPackage {
  scope: Scope;
  task: string;
  objects: ModelObject[];
  relations: ModelRelation[];
  candidates: ProviderCandidate[];
  messages: ProviderMessage[];
  estimatedInputTokens: number;
  /** 因权限/预算被裁掉的候选数量。 */
  droppedObjectCount: number;
}
