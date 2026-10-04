import { describe, expect, it } from 'vitest';
import { projectBundle } from '../adapter';
import {
  createChangeSet,
  layoutDragOperation,
  titleUpdateOperation,
  type ChangeSource,
} from '../changeset';
import { loadDemoTradeBundleNode } from '../load-node';
import { amplifyBundle, expectedScaleCounts } from '../scale';

const bundle = loadDemoTradeBundleNode();

describe('Domain → React Flow 适配层', () => {
  it('读取并校验真实 fixture（demo-trade）', () => {
    expect(bundle.projectId).toBe('PRJ-TRADE-001');
    expect(bundle.modelObject.length).toBeGreaterThan(0);
    expect(bundle.modelRelation.length).toBeGreaterThan(0);
  });

  it('node.id 与 model_object.id 完全一致（P1 对象 ID 一致）', () => {
    const projection = projectBundle(bundle, { layout: 'auto' });
    const objectIds = new Set(bundle.modelObject.map((o) => o.id));
    const nodeIds = new Set(projection.nodes.map((n) => n.id));
    expect(nodeIds.size).toBe(objectIds.size);
    for (const id of objectIds) expect(nodeIds.has(id)).toBe(true);
  });

  it('每条边的两端都存在于节点集合中', () => {
    const projection = projectBundle(bundle, { layout: 'auto' });
    const nodeIds = new Set(projection.nodes.map((n) => n.id));
    for (const edge of projection.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it('flow_to 的条件 label 作为边标签保留', () => {
    const projection = projectBundle(bundle, { layout: 'auto' });
    const dec001 = projection.edges.find((e) => e.id === 'rel-027');
    expect(dec001).toBeDefined();
    expect(dec001?.data?.conditionLabel).toBe('是（折扣 > 10%）：提交销售经理审批');
    expect(String(dec001?.label)).toContain('折扣');
  });

  it('投影是纯函数：不修改输入，且同一输入幂等', () => {
    const before = JSON.stringify(bundle);
    const first = projectBundle(bundle, { layout: 'auto' });
    const after = JSON.stringify(bundle);
    expect(after).toBe(before);

    const second = projectBundle(bundle, { layout: 'auto' });
    expect(JSON.stringify(second.nodes)).toBe(JSON.stringify(first.nodes));
    expect(JSON.stringify(second.edges)).toBe(JSON.stringify(first.edges));
  });

  it('view_layout 模式使用 fixture 坐标；auto 模式重算坐标', () => {
    const lay = projectBundle(bundle, { layout: 'view_layout' });
    const start = lay.nodes.find((n) => n.id === 'START-001');
    expect(start?.position).toEqual({ x: 40, y: 80 });
    expect(start?.data.hasLayout).toBe(true);

    const auto = projectBundle(bundle, { layout: 'auto' });
    const autoStart = auto.nodes.find((n) => n.id === 'START-001');
    expect(autoStart?.data.hasLayout).toBe(false);
    expect(autoStart?.position).not.toEqual({ x: 40, y: 80 });
  });

  it('每个泳道至少包含一个节点，且泳道 id 源于角色或被使用', () => {
    const projection = projectBundle(bundle, { layout: 'auto' });
    expect(projection.lanes.length).toBeGreaterThan(0);
    for (const lane of projection.lanes) {
      const members = projection.nodes.filter((n) => n.data.lane === lane.id);
      expect(members.length).toBeGreaterThan(0);
      expect(lane.width).toBeGreaterThan(0);
      expect(lane.height).toBeGreaterThan(0);
    }
    // 角色泳道标签应等于角色 title
    const roleLane = projection.lanes.find((l) => l.id === 'ROLE-001');
    expect(roleLane?.label).toBe(bundle.modelObject.find((o) => o.id === 'ROLE-001')?.title);
  });

  it('sourceStatus 决定节点强调色与推断标记', () => {
    const projection = projectBundle(bundle, { layout: 'auto' });
    const inferred = projection.nodes.find((n) => n.id === 'DEC-002');
    expect(inferred?.data.sourceStatus).toBe('agent_inference');
    expect(inferred?.data.inferred).toBe(true);
  });
});

describe('编辑事件 → ChangeSet（§5.3 形状）', () => {
  it('拖动节点产出 view_layout 更新操作', () => {
    const op = layoutDragOperation({
      objectId: 'ACT-001',
      viewId: 'VIEW-001',
      layoutId: 'LAY-002',
      from: { x: 200, y: 80 },
      to: { x: 260, y: 96 },
    });
    expect(op.op).toBe('update');
    expect(op.targetType).toBe('view_layout');
    expect(op.targetId).toBe('LAY-002');
    expect(op.before).toEqual({ x: 200, y: 80 });
    expect(op.after).toMatchObject({ x: 260, y: 96 });
    expect(op.sourceRefs[0]?.referenceIds).toEqual(['ACT-001']);
    expect(op.confidenceState).toBe('user_statement');
  });

  it('改 title 产出 model_object 更新操作，confidenceState 取自对象来源状态', () => {
    const req = bundle.modelObject.find((o) => o.id === 'REQ-001');
    expect(req).toBeDefined();
    const sourceRefs: ChangeSource[] = bundle.evidenceLink
      .filter((l) => l.objectId === 'REQ-001')
      .map((l) => ({ type: 'evidence', referenceIds: [l.evidenceId] }));
    expect(sourceRefs.length).toBeGreaterThan(0);

    const op = titleUpdateOperation({
      object: req!,
      nextTitle: '折扣超 10% 必须经理审批（已确认）',
      sourceRefs,
    });
    expect(op.targetType).toBe('model_object');
    expect(op.targetId).toBe('REQ-001');
    expect(op.before).toEqual({ title: req!.title });
    expect(op.after).toEqual({ title: '折扣超 10% 必须经理审批（已确认）' });
    expect(op.confidenceState).toBe(req!.sourceStatus);
    expect(op.sourceRefs).toBe(sourceRefs);
  });

  it('布局补丁不落 revision，语义变更落 revision', () => {
    const layoutOp = layoutDragOperation({
      objectId: 'ACT-001',
      viewId: 'VIEW-001',
      layoutId: null,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
    });
    const patch = createChangeSet({
      projectId: bundle.projectId,
      basedOnRevision: bundle.projectRevision,
      kind: 'view_layout_patch',
      reason: '拖动',
      source: { type: 'user_action', referenceIds: ['ACT-001'] },
      operations: [layoutOp],
    });
    expect(patch.bumpsRevision).toBe(false);

    const req = bundle.modelObject.find((o) => o.id === 'REQ-001')!;
    const semantic = createChangeSet({
      projectId: bundle.projectId,
      basedOnRevision: bundle.projectRevision,
      kind: 'semantic',
      reason: '改标题',
      source: { type: 'user_action', referenceIds: ['REQ-001'] },
      operations: [titleUpdateOperation({ object: req, nextTitle: 'x', sourceRefs: [] })],
    });
    expect(semantic.bumpsRevision).toBe(true);
    expect(semantic.operations[0]?.sourceRefs.length).toBe(1);
  });
});

describe('程序化放大（规模曲线）', () => {
  it('factor=1 返回原 bundle；factor=N 各集合恰好 N 倍', () => {
    expect(amplifyBundle(bundle, { factor: 1 })).toBe(bundle);
    const factor = 6;
    const scaled = amplifyBundle(bundle, { factor });
    const expected = expectedScaleCounts(bundle, factor);
    expect(scaled.modelObject.length).toBe(expected.objects);
    expect(scaled.modelRelation.length).toBe(expected.relations);
    expect(scaled.viewLayout.length).toBe(expected.viewLayout);
  });

  it('放大后关系端点仍存在、code 在 kind 内唯一（Schema 仍有效）', () => {
    const scaled = amplifyBundle(bundle, { factor: 6 });
    const ids = new Set(scaled.modelObject.map((o) => o.id));
    for (const r of scaled.modelRelation) {
      expect(ids.has(r.fromId)).toBe(true);
      expect(ids.has(r.toId)).toBe(true);
    }
    const keys = new Set<string>();
    for (const o of scaled.modelObject) {
      const key = `${o.projectId}::${o.kind}::${o.code}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
    // 放大 bundle 可正常投影
    const projection = projectBundle(scaled, { layout: 'auto' });
    expect(projection.nodes.length).toBe(scaled.modelObject.length);
  });
});
