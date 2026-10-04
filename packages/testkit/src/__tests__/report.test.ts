import { describe, it, expect } from 'vitest';
import { checkBundle } from '../validate-bundle';
import { loadFixtureBundle } from '../fixtures';

/**
 * E 证据：打印基准样本统计与 finding 汇总。
 * 运行 `pnpm --filter @reqatlas/testkit test` 即可在控制台看到以下输出。
 */
describe('证据报告：基准样本统计', () => {
  it('打印 demo-trade 的统计与 finding 汇总', () => {
    const bundle = loadFixtureBundle('demo-trade');
    const { stats, findingCounts } = checkBundle(bundle);

    console.log('[report] seed=demo-trade');

    console.log(`[report] objectTotal=${stats.objectTotal}`);

    console.log(`[report] relationTotal=${stats.relationTotal}`);

    console.log(`[report] viewTotal=${stats.viewTotal} viewLayoutTotal=${stats.viewLayoutTotal}`);

    console.log(`[report] countByKind=${JSON.stringify(stats.countByKind)}`);

    console.log(`[report] countByState=${JSON.stringify(stats.countByState)}`);

    console.log(`[report] countBySourceStatus=${JSON.stringify(stats.countBySourceStatus)}`);

    console.log(
      `[report] evidenceTotal=${stats.evidenceTotal} evidenceLinkTotal=${stats.evidenceLinkTotal}`,
    );

    console.log(
      `[report] countEvidenceByClassification=${JSON.stringify(stats.countEvidenceByClassification)}`,
    );

    console.log(`[report] topLevelKeys=${JSON.stringify(Object.keys(bundle).sort())}`);

    const originKeys = [
      ...new Set(
        bundle.modelObject
          .map((o) => (o.payload.templateOrigin as { itemKey?: string } | undefined)?.itemKey)
          .filter((k): k is string => typeof k === 'string'),
      ),
    ].sort();
    console.log(
      `[report] templateOriginUniqueItemKeys=${originKeys.length} -> ${JSON.stringify(originKeys)}`,
    );

    const cross: Record<string, number> = {};
    for (const o of bundle.modelObject) {
      const cand =
        o.payload.templateCandidate === true
          ? 'true'
          : o.payload.templateCandidate === false
            ? 'false'
            : 'absent';
      const key = `${cand}/${o.state}`;
      cross[key] = (cross[key] ?? 0) + 1;
    }
    console.log(`[report] templateCandidateByState=${JSON.stringify(cross)}`);

    console.log(
      `[report] findings: block=${findingCounts.block} error=${findingCounts.error} warn=${findingCounts.warn} total=${findingCounts.total}`,
    );

    expect(stats.objectTotal).toBeGreaterThan(0);
    expect(stats.relationTotal).toBeGreaterThan(0);
    expect(findingCounts.total).toBe(0);
    // 模板项键必须逐对象区分（缺陷 1 回归）
    expect(originKeys.length).toBeGreaterThan(1);
    // 模板候选不得与已确认状态共存（缺陷 2 回归）
    expect(
      bundle.modelObject.some(
        (o) =>
          o.payload.templateCandidate === true &&
          (o.state === 'confirmed' || o.state === 'approved'),
      ),
    ).toBe(false);
  });
});
