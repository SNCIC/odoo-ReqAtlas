import { validateBundle, type ModelBundle } from '@reqatlas/testkit';
import type { ChangeDraft, Finding } from '../contract';
import { projectDraft, type ProjectionOptions, type ProjectionResult } from './project-bundle';

/**
 * Domain Guard：Schema Guard 之后的第二次校验（§5.3）。
 *
 * 组成：
 * 1. 结构性门禁（本 Spike 直接针对 ChangeDraft/ChangeSet 的前置约束）：
 *    `SOURCE_REQUIRED` / `DANGLING_REFERENCE` / `UNKNOWN_ENUM` / `CROSS_PROJECT_REFERENCE` /
 *    `INVALID_OPERATION`。
 * 2. 契约 12 条领域规则中与草案相关的语义规则：把草案投影到 bundle 的**深拷贝**上，
 *    复用 `@reqatlas/testkit` 的 `validateBundle`（权威跨对象校验器）得到 findings。
 * 3. `AGENT_ASSUMPTION`：草案 `assumptions` 非空即阻断（假设永远不能进入基线）。
 *
 * 说明：结构性门禁码（SOURCE_REQUIRED / DANGLING_REFERENCE / UNKNOWN_ENUM / INVALID_OPERATION）
 * 不在 `docs/api/domain-rules.md` 的 12 条契约规则码内，属**本 Spike 的结构性前置门禁**，
 * 沿用仓库既有先例（testkit `validateBundle` 亦有 12 条之外的稳定码）。如需进契约须走变更单。
 */

export interface DomainGuardResult {
  projected: ModelBundle;
  tempToId: Map<string, string>;
  appliedOperationIds: string[];
  findings: Finding[];
  /** severity ∈ {block, error}：非空则草案不可应用。 */
  blocking: Finding[];
  /** severity = warn：可应用但需人工确认。 */
  warnings: Finding[];
}

export type DomainGuardOptions = ProjectionOptions;

export interface DomainGuard {
  check(draft: ChangeDraft, bundle: ModelBundle, options?: DomainGuardOptions): DomainGuardResult;
}

export function createDomainGuard(): DomainGuard {
  return {
    check(draft, bundle, options = {}) {
      const projection: ProjectionResult = projectDraft(draft, bundle, options);
      const findings: Finding[] = [...projection.structuralFindings];

      if (draft.assumptions.length > 0) {
        findings.push({
          ruleCode: 'AGENT_ASSUMPTION',
          severity: 'block',
          objectIds: [],
          message: `草案包含 ${draft.assumptions.length} 条假设，假设（agent_inference）永远不能进入基线；请人工确认后再生成无假设操作。`,
        });
      }

      if (projection.bundleParseable) {
        for (const f of validateBundle(projection.projected)) {
          findings.push({
            ruleCode: f.ruleCode,
            severity: f.severity,
            objectIds: [...f.objectIds],
            message: f.message,
          });
        }
      }

      const blocking = findings.filter((f) => f.severity === 'block' || f.severity === 'error');
      const warnings = findings.filter((f) => f.severity === 'warn');
      return {
        projected: projection.projected,
        tempToId: projection.tempToId,
        appliedOperationIds: projection.appliedOperationIds,
        findings,
        blocking,
        warnings,
      };
    },
  };
}
