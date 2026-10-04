import { describe, it, expect } from 'vitest';
import { checkBundle } from '../validate-bundle';
import type { ModelBundle, ModelRelation } from '../model-bundle.schema';
import { loadFixtureBundle } from '../fixtures';

/**
 * E 反例：同时注入四类违规
 *  1) 关系悬空（端点不存在）
 *  2) 一个 activity 拥有两个 accountable_A
 *  3) 一个 requirement 无来源（缺 derived_from）
 *  4) 证据链接悬空（evidenceId 不存在）
 * 并打印真实 finding 输出，证明校验器能抓到。
 */
function buildIllegalSample(): ModelBundle {
  const bundle = structuredClone(loadFixtureBundle('demo-trade'));

  // 1) 关系悬空：fromId 指向不存在的对象
  const dangling: ModelRelation = {
    id: 'rel-illegal-dangling',
    kind: 'flow_to',
    fromId: 'ACT-DOES-NOT-EXIST',
    toId: 'ACT-001',
  };
  bundle.modelRelation.push(dangling);

  // 2) 一个 activity 两个 A
  bundle.modelRelation.push({
    id: 'rel-illegal-second-a',
    kind: 'accountable_A',
    fromId: 'ROLE-001',
    toId: 'ACT-001',
  });

  // 3) requirement 无来源：移除 REQ-001 的 derived_from
  bundle.modelRelation = bundle.modelRelation.filter((r) => r.id !== 'rel-058');

  // 4) 证据链接悬空：evidenceId 不存在
  bundle.evidenceLink.push({
    id: 'EL-illegal-dangling',
    evidenceId: 'EV-DOES-NOT-EXIST',
    objectId: 'ACT-001',
    excerpt: 'x',
    purpose: 'y',
  });

  return bundle;
}

describe('反例样本被校验器捕获', () => {
  it('三项违规全部命中，并打印真实输出', () => {
    const bundle = buildIllegalSample();
    const result = checkBundle(bundle);

    console.log('[negative-sample] findingCounts =', JSON.stringify(result.findingCounts));

    console.log(
      '[negative-sample] findings =',
      JSON.stringify(
        result.findings.map((f) => ({
          ruleCode: f.ruleCode,
          severity: f.severity,
          objectIds: f.objectIds,
        })),
        null,
        2,
      ),
    );

    const codes = new Set(result.findings.map((f) => f.ruleCode));
    expect(codes.has('RELATION_ENDPOINT_MISSING')).toBe(true);
    expect(codes.has('ACTIVITY_MULTI_A')).toBe(true);
    expect(codes.has('REQUIREMENT_NO_SOURCE')).toBe(true);
    expect(codes.has('EVIDENCE_LINK_DANGLING')).toBe(true);
    expect(result.findingCounts.block).toBeGreaterThan(0);
  });
});
