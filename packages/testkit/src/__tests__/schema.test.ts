import { describe, it, expect } from 'vitest';
import { modelBundleSchema } from '../model-bundle.schema';
import { loadFixtureBundle } from '../fixtures';

/** 一个最小合法 bundle，用于字段级反例。 */
function minimalBundle(): Record<string, unknown> {
  return {
    projectId: 'PRJ-TEST',
    projectRevision: 1,
    modelObject: [
      {
        id: 'o1',
        projectId: 'PRJ-TEST',
        kind: 'role',
        code: 'ROLE-001',
        title: '测试角色',
        state: 'draft',
        sourceStatus: 'user_statement',
        objectRev: 1,
        payload: {},
      },
    ],
    modelRelation: [],
    view: [],
    viewLayout: [],
    evidence: [],
    evidenceLink: [],
  };
}

function withMutation(mut: (b: ReturnType<typeof minimalBundle>) => void): unknown {
  const b = minimalBundle();
  mut(b);
  return b;
}

describe('model-bundle schema', () => {
  it('接受 demo-trade 金样例', () => {
    const bundle = loadFixtureBundle('demo-trade');
    expect(bundle.projectRevision).toBe(1);
    expect(bundle.modelObject.length).toBeGreaterThan(0);
  });

  it('接受最小合法 bundle', () => {
    expect(modelBundleSchema.safeParse(minimalBundle()).success).toBe(true);
  });

  it('拒绝未知 object kind', () => {
    const bad = withMutation((b) => {
      (b.modelObject as Array<Record<string, unknown>>)[0].kind = 'not_a_kind';
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('拒绝未知 state', () => {
    const bad = withMutation((b) => {
      (b.modelObject as Array<Record<string, unknown>>)[0].state = 'done';
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('拒绝未知 sourceStatus', () => {
    const bad = withMutation((b) => {
      (b.modelObject as Array<Record<string, unknown>>)[0].sourceStatus = 'guess';
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('拒绝缺失 projectRevision', () => {
    const bad = withMutation((b) => {
      delete b.projectRevision;
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('拒绝未知 relation kind 与负 objectRev', () => {
    const bad = withMutation((b) => {
      b.modelRelation = [{ id: 'r1', kind: 'not_a_relation', fromId: 'o1', toId: 'o1' }];
      (b.modelObject as Array<Record<string, unknown>>)[0].objectRev = -1;
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('拒绝缺失 x/y 的 viewLayout', () => {
    const bad = withMutation((b) => {
      b.viewLayout = [{ id: 'l1', viewId: 'v1', objectId: 'o1', locked: false }];
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('接受合法 evidence / evidenceLink', () => {
    const b = withMutation((x) => {
      x.evidence = [
        {
          id: 'EV-1',
          type: 'interview_segment',
          locator: '访谈录音 00:00:10-00:00:30',
          provider: '销售员',
          capturedAt: '2026-03-12',
          classification: 'sensitive',
        },
      ];
      x.evidenceLink = [
        { id: 'EL-1', evidenceId: 'EV-1', objectId: 'o1', excerpt: '片段', purpose: '支撑' },
      ];
    });
    expect(modelBundleSchema.safeParse(b).success).toBe(true);
  });

  it('拒绝非法 evidence type / classification', () => {
    const bad = withMutation((x) => {
      x.evidence = [
        {
          id: 'EV-1',
          type: 'not_a_type',
          locator: 'x',
          provider: '销售员',
          capturedAt: '2026-03-12',
          classification: 'top_secret',
        },
      ];
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('拒绝缺失 evidence 集合的 bundle', () => {
    const bad = withMutation((x) => {
      delete x.evidence;
    });
    expect(modelBundleSchema.safeParse(bad).success).toBe(false);
  });
});
