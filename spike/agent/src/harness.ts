import type { ModelBundle } from '@reqatlas/testkit';
import type { ContextPermissions } from './context/types';
import { createDomainGuard } from './guard/domain-guard';
import { createSchemaGuard } from './guard/schema-guard';
import { createDraftStore, type DraftStore } from './draft/draft-store';
import type { AgentDependencies, AgentPolicy } from './orchestrator';
import type { ProviderAdapter } from './provider/types';
import { createRetriever } from './retriever/retriever';

/** 组装编排依赖的便捷工厂（测试与脚本共用，避免重复装配）。 */
export interface HarnessParams {
  bundle: ModelBundle;
  provider: ProviderAdapter;
  policy?: Partial<AgentPolicy>;
  permissions?: ContextPermissions;
  foreignProjectById?: ReadonlyMap<string, string>;
  draftStore?: DraftStore;
}

export function createDependencies(params: HarnessParams): AgentDependencies {
  return {
    provider: params.provider,
    bundle: params.bundle,
    retriever: createRetriever(params.bundle),
    schemaGuard: createSchemaGuard(),
    domainGuard: createDomainGuard(),
    draftStore: params.draftStore ?? createDraftStore(),
    policy: params.policy,
    permissions: params.permissions,
    foreignProjectById: params.foreignProjectById,
  };
}
