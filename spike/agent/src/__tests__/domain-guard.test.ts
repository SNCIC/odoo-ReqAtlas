import { describe, expect, it } from 'vitest';
import type { ChangeDraft, DraftChange, SourceRef } from '../contract';
import { createDomainGuard } from '../guard/domain-guard';
import { loadDemoTradeBundle } from '../load';

const bundle = loadDemoTradeBundle();
const guard = createDomainGuard();

const USER: SourceRef = { type: 'user_input', id: 'msg_1' };

function makeDraft(changes: DraftChange[], assumptions: string[] = []): ChangeDraft {
  return {
    draftId: 'draft_test',
    basedOnRevision: bundle.projectRevision,
    scope: { type: 'project', id: bundle.projectId },
    intent: 'modify',
    assumptions,
    changes,
    sources: [USER],
    validation: { blocking: [], warnings: [] },
    summary: '测试草案',
  };
}

function createObject(overrides: Partial<Record<string, unknown>> = {}, sourceRefs = [USER]): DraftChange {
  return {
    operationId: 'op_1',
    op: 'create',
    targetType: 'model_object',
    tempId: 'tmp_x',
    before: null,
    after: {
      kind: 'activity',
      code: 'ACT-900',
      title: '测试事项',
      state: 'draft',
      sourceStatus: 'user_statement',
      payload: {},
      ...overrides,
    },
    reason: '测试',
    sourceRefs,
    confidenceState: 'user_statement',
  };
}

function linkRelation(kind: string, fromId: string, toId: string): DraftChange {
  return {
    operationId: 'op_link',
    op: 'link',
    targetType: 'model_relation',
    tempId: 'tmp_rel',
    before: null,
    after: { kind, fromId, toId },
    reason: '测试连线',
    sourceRefs: [USER],
    confidenceState: 'user_statement',
  };
}

describe('Domain Guard：结构性门禁', () => {
  it('事实型操作缺 sourceRefs → 阻断（SOURCE_REQUIRED）', () => {
    const result = guard.check(makeDraft([createObject({}, [])]), bundle);
    expect(result.blocking.map((f) => f.ruleCode)).toContain('SOURCE_REQUIRED');
  });

  it('悬空引用 → 阻断（DANGLING_REFERENCE）', () => {
    const update: DraftChange = {
      operationId: 'op_u',
      op: 'update',
      targetType: 'model_object',
      targetId: 'ACT-999',
      before: null,
      after: { title: '不存在' },
      reason: '测试',
      sourceRefs: [USER],
      confidenceState: 'user_statement',
    };
    const result = guard.check(makeDraft([update]), bundle);
    expect(result.blocking.map((f) => f.ruleCode)).toContain('DANGLING_REFERENCE');
  });

  it('未知枚举 → 阻断（UNKNOWN_ENUM）', () => {
    const result = guard.check(makeDraft([createObject({ kind: 'gadget' })]), bundle);
    expect(result.blocking.map((f) => f.ruleCode)).toContain('UNKNOWN_ENUM');
  });

  it('跨项目引用 → 阻断（CROSS_PROJECT_REFERENCE）', () => {
    const update: DraftChange = {
      operationId: 'op_x',
      op: 'update',
      targetType: 'model_object',
      targetId: 'ROLE-EXT-1',
      before: null,
      after: { title: '外部项目对象' },
      reason: '测试',
      sourceRefs: [USER],
      confidenceState: 'user_statement',
    };
    const result = guard.check(makeDraft([update]), bundle, {
      foreignProjectById: new Map([['ROLE-EXT-1', 'PRJ-OTHER-999']]),
    });
    expect(result.blocking.map((f) => f.ruleCode)).toContain('CROSS_PROJECT_REFERENCE');
  });

  it('关系端点悬空 → 阻断', () => {
    const result = guard.check(makeDraft([linkRelation('performs_R', 'ROLE-003', 'ACT-404')]), bundle);
    expect(result.blocking.map((f) => f.ruleCode)).toContain('DANGLING_REFERENCE');
  });
});

describe('Domain Guard：契约领域规则（投影后复用 testkit 校验器）', () => {
  it('同一事项出现两个 A → ACTIVITY_MULTI_A', () => {
    // ACT-003 已有 accountable_A ROLE-002（rel-006），再加 ROLE-003。
    const result = guard.check(makeDraft([linkRelation('accountable_A', 'ROLE-003', 'ACT-003')]), bundle);
    expect(result.blocking.map((f) => f.ruleCode)).toContain('ACTIVITY_MULTI_A');
  });

  it('assumptions 非空 → AGENT_ASSUMPTION 阻断', () => {
    const result = guard.check(
      makeDraft([createObject()], ['用户尚未确认折扣阈值']),
      bundle,
    );
    expect(result.blocking.map((f) => f.ruleCode)).toContain('AGENT_ASSUMPTION');
  });

  it('新建对象无证据 → OBJECT_NO_EVIDENCE 仅进入 warnings，不阻断', () => {
    const result = guard.check(makeDraft([createObject()]), bundle);
    expect(result.blocking.map((f) => f.ruleCode)).not.toContain('OBJECT_NO_EVIDENCE');
    expect(result.warnings.map((f) => f.ruleCode)).toContain('OBJECT_NO_EVIDENCE');
  });

  it('投影不改动原始 bundle（深拷贝）', () => {
    const before = JSON.stringify(bundle);
    guard.check(makeDraft([createObject()]), bundle);
    expect(JSON.stringify(bundle)).toBe(before);
  });
});
