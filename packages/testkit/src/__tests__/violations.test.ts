import { describe, it, expect } from 'vitest';
import { checkBundle, validateBundle } from '../validate-bundle';
import type { ModelBundle, ModelRelation } from '../model-bundle.schema';
import { loadFixtureBundle } from '../fixtures';

function baseTrade(): ModelBundle {
  return structuredClone(loadFixtureBundle('demo-trade'));
}

function findRule(bundle: ModelBundle, ruleCode: string) {
  return validateBundle(bundle).find((f) => f.ruleCode === ruleCode);
}

describe('每类违规都能被抓出', () => {
  it('FLOW_NO_END（block）：删除通往 end 的流转', () => {
    const b = baseTrade();
    b.modelRelation = b.modelRelation.filter((r) => r.id !== 'rel-037');
    const findings = validateBundle(b).filter((x) => x.ruleCode === 'FLOW_NO_END');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((x) => x.severity === 'block')).toBe(true);
    const flagged = new Set(findings.flatMap((x) => x.objectIds));
    expect(flagged.has('ACT-008')).toBe(true);
    expect(flagged.has('ACT-007')).toBe(true);
  });

  it('DECISION_NO_CONDITION（error）：决策出口缺条件标签', () => {
    const b = baseTrade();
    const rel = b.modelRelation.find((r) => r.id === 'rel-027')!;
    delete rel.label;
    const f = findRule(b, 'DECISION_NO_CONDITION');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.objectIds).toContain('DEC-001');
  });

  it('EXCEPTION_NO_TARGET（error）：异常无去向', () => {
    const b = baseTrade();
    b.modelRelation = b.modelRelation.filter((r) => r.id !== 'rel-038');
    const f = findRule(b, 'EXCEPTION_NO_TARGET');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.objectIds).toContain('EXC-001');
  });

  it('ACTIVITY_NO_R（block）：活动无执行者', () => {
    const b = baseTrade();
    b.modelRelation = b.modelRelation.filter((r) => r.id !== 'rel-001');
    const f = findRule(b, 'ACTIVITY_NO_R');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
    expect(f!.objectIds).toContain('ACT-001');
  });

  it('ACTIVITY_MULTI_A（error）：活动有两个 A', () => {
    const b = baseTrade();
    const extra: ModelRelation = {
      id: 'rel-extra-a',
      kind: 'accountable_A',
      fromId: 'ROLE-001',
      toId: 'ACT-001',
    };
    b.modelRelation.push(extra);
    const f = findRule(b, 'ACTIVITY_MULTI_A');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.objectIds).toContain('ACT-001');
  });

  it('HANDOFF_NO_OBJECT（warn）：跨角色交接未携带数据对象', () => {
    const b = baseTrade();
    const rel = b.modelRelation.find((r) => r.id === 'rel-034')!;
    delete rel.payload;
    const f = findRule(b, 'HANDOFF_NO_OBJECT');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warn');
  });

  it('REQUIREMENT_NO_SOURCE（block）：需求无来源', () => {
    const b = baseTrade();
    b.modelRelation = b.modelRelation.filter((r) => r.id !== 'rel-058');
    const f = findRule(b, 'REQUIREMENT_NO_SOURCE');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
    expect(f!.objectIds).toContain('REQ-001');
  });

  it('OBJECT_NO_EVIDENCE（warn）：关键事实对象缺证据链接', () => {
    const b = baseTrade();
    b.evidenceLink = b.evidenceLink.filter((l) => l.id !== 'EL-012');
    const f = findRule(b, 'OBJECT_NO_EVIDENCE');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warn');
    expect(f!.objectIds).toContain('PROB-001');
  });

  it('EVIDENCE_LINK_DANGLING（block）：证据链接端点不存在', () => {
    const b = baseTrade();
    b.evidenceLink.push({
      id: 'EL-dangling',
      evidenceId: 'EV-NOPE',
      objectId: 'ACT-001',
      excerpt: 'x',
      purpose: 'y',
    });
    const f = findRule(b, 'EVIDENCE_LINK_DANGLING');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
  });

  it('EVIDENCE_LINK_NO_EXCERPT（warn）：引用片段为空', () => {
    const b = baseTrade();
    const link = b.evidenceLink.find((l) => l.id === 'EL-001')!;
    link.excerpt = '';
    const f = findRule(b, 'EVIDENCE_LINK_NO_EXCERPT');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warn');
    expect(f!.objectIds).toContain('EL-001');
  });

  it('TEMPLATE_CANDIDATE_CONFIRMED（block）：模板候选与已确认状态互斥', () => {
    const b = baseTrade();
    const obj = b.modelObject.find((o) => o.id === 'ROLE-001')!;
    obj.payload.templateCandidate = true; // ROLE-001 的 state 为 confirmed
    const f = findRule(b, 'TEMPLATE_CANDIDATE_CONFIRMED');
    console.log('[negative] TEMPLATE_CANDIDATE_CONFIRMED =', JSON.stringify(f));
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
    expect(f!.objectIds).toContain('ROLE-001');
  });

  it('未修改的基准样本不产生任何 finding', () => {
    expect(checkBundle(baseTrade()).findings).toEqual([]);
  });
});
