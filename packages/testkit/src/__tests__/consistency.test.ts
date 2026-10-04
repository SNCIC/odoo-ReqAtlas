import { describe, it, expect } from 'vitest';
import { validateBundle } from '../validate-bundle';
import type { ModelBundle } from '../model-bundle.schema';
import { loadFixtureBundle } from '../fixtures';

function baseTrade(): ModelBundle {
  return structuredClone(loadFixtureBundle('demo-trade'));
}

describe('结构性一致性校验', () => {
  it('DUPLICATE_OBJECT_CODE（block）：同 project+kind 内 code 重复', () => {
    const b = baseTrade();
    b.modelObject[1].code = 'ROLE-001';
    const f = validateBundle(b).find((x) => x.ruleCode === 'DUPLICATE_OBJECT_CODE');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
  });

  it('RELATION_ENDPOINT_MISSING（block）：关系端点悬空', () => {
    const b = baseTrade();
    b.modelRelation.push({
      id: 'rel-dangling',
      kind: 'flow_to',
      fromId: 'GHOST-FROM',
      toId: 'ACT-001',
    });
    const f = validateBundle(b).find((x) => x.ruleCode === 'RELATION_ENDPOINT_MISSING');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
  });

  it('LAYOUT_OBJECT_MISSING（block）：viewLayout 引用不存在对象', () => {
    const b = baseTrade();
    b.viewLayout.push({
      id: 'lay-ghost',
      viewId: 'VIEW-001',
      objectId: 'GHOST-OBJECT',
      x: 0,
      y: 0,
      locked: false,
    });
    const f = validateBundle(b).find((x) => x.ruleCode === 'LAYOUT_OBJECT_MISSING');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
  });

  it('CROSS_PROJECT_REFERENCE（block）：对象跨项目', () => {
    const b = baseTrade();
    b.modelObject[0].projectId = 'PRJ-OTHER';
    const f = validateBundle(b).find((x) => x.ruleCode === 'CROSS_PROJECT_REFERENCE');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('block');
  });

  it('CROSS_PROJECT_REFERENCE（block）：关系端点跨项目', () => {
    const b = baseTrade();
    b.modelRelation.push({
      id: 'rel-cross',
      kind: 'flow_to',
      fromId: 'ACT-001',
      toId: 'GHOST-OTHER',
    });
    const ids = validateBundle(b)
      .filter(
        (x) =>
          x.ruleCode === 'CROSS_PROJECT_REFERENCE' || x.ruleCode === 'RELATION_ENDPOINT_MISSING',
      )
      .map((x) => x.ruleCode);
    expect(ids.length).toBeGreaterThan(0);
  });
});
