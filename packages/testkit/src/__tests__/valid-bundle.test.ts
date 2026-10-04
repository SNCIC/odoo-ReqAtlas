import { describe, it, expect } from 'vitest';
import { checkBundle } from '../validate-bundle';
import { loadFixtureBundle, readFixtureJson } from '../fixtures';

interface Manifest {
  seed: string;
  expectedCounts: Record<string, number>;
  expectedObjectTotal: number;
  expectedRelationTotal: number;
  expectedEvidenceCount: number;
  expectedEvidenceLinkCount: number;
  expectedFindings: { block: number; error: number; warn: number };
}

describe('金样例：合法样本通过', () => {
  it('demo-trade：block/error/warn 全部为 0', () => {
    const bundle = loadFixtureBundle('demo-trade');
    const result = checkBundle(bundle);
    expect(result.findingCounts).toEqual({ block: 0, error: 0, warn: 0, total: 0 });
    expect(result.findings).toEqual([]);
  });

  it('demo-trade：对象/关系计数与 manifest 一致', () => {
    const bundle = loadFixtureBundle('demo-trade');
    const manifest = readFixtureJson<Manifest>('demo-trade/manifest.json');
    const result = checkBundle(bundle);

    expect(result.stats.objectTotal).toBe(manifest.expectedObjectTotal);
    expect(result.stats.relationTotal).toBe(manifest.expectedRelationTotal);
    expect(result.stats.evidenceTotal).toBe(manifest.expectedEvidenceCount);
    expect(result.stats.evidenceLinkTotal).toBe(manifest.expectedEvidenceLinkCount);
    expect(result.stats.countByKind).toEqual(manifest.expectedCounts);
    expect(result.findingCounts.block).toBe(manifest.expectedFindings.block);
    expect(result.findingCounts.error).toBe(manifest.expectedFindings.error);
    expect(result.findingCounts.warn).toBe(manifest.expectedFindings.warn);
  });

  it('demo-trade：证据独立建模，且含 sensitive 分级', () => {
    const bundle = loadFixtureBundle('demo-trade');
    // 证据与 evidenceLink 不作为 modelObject
    expect(bundle.modelObject.some((o) => o.id.startsWith('EV-'))).toBe(false);
    expect(
      bundle.modelObject.every((o) => o.kind !== 'data_object' || o.id.startsWith('DO-')),
    ).toBe(true);
    // 至少 1 条 sensitive
    expect(bundle.evidence.some((e) => e.classification === 'sensitive')).toBe(true);
    // 每条 evidenceLink 都有非空 excerpt
    expect(bundle.evidenceLink.every((l) => l.excerpt.trim().length > 0)).toBe(true);
  });

  it('demo-trade：模板候选与已确认并存，且 templateOrigin 逐对象区分', () => {
    const bundle = loadFixtureBundle('demo-trade');
    const candidates = bundle.modelObject.filter((o) => o.payload.templateCandidate === true);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((o) => o.state === 'draft' || o.state === 'pending_confirmation')).toBe(
      true,
    );

    const originKeys = new Set(
      bundle.modelObject
        .map((o) => (o.payload.templateOrigin as { itemKey?: string } | undefined)?.itemKey)
        .filter((k): k is string => typeof k === 'string'),
    );
    expect(originKeys.size).toBeGreaterThan(1);
  });

  it('demo-trade：来源状态混合出现（事实与推断分离）', () => {
    const bundle = loadFixtureBundle('demo-trade');
    const statuses = new Set(bundle.modelObject.map((o) => o.sourceStatus));
    expect(statuses.has('user_statement')).toBe(true);
    expect(statuses.has('material_extracted')).toBe(true);
    expect(statuses.has('consultant_judgment')).toBe(true);
    expect(statuses.has('agent_inference')).toBe(true);
  });

  it('demo-trade：state 混合（含 draft 与 confirmed）', () => {
    const bundle = loadFixtureBundle('demo-trade');
    const states = new Set(bundle.modelObject.map((o) => o.state));
    expect(states.has('draft')).toBe(true);
    expect(states.has('confirmed')).toBe(true);
  });

  it('demo-manufacturing：合法样本通过（0 findings）', () => {
    const bundle = loadFixtureBundle('demo-manufacturing');
    const result = checkBundle(bundle);
    expect(result.findingCounts).toEqual({ block: 0, error: 0, warn: 0, total: 0 });
  });
});
