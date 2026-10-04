import { describe, expect, it } from 'vitest';
import { loadDemoTradeBundle } from '../presentation/load-fixture';
import { projectScene } from '../projection/project-scene';

describe('M0-04 投影确定性（同一 ModelBundle → 完全一致输出）', () => {
  it('同一 bundle 连跑两次，序列化结果逐字节相同', () => {
    const bundle = loadDemoTradeBundle();
    const first = projectScene(bundle);
    const second = projectScene(bundle);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).toEqual(second);
  });

  it('输出不含时间戳（证明无时间依赖）', () => {
    const serialized = JSON.stringify(projectScene(loadDemoTradeBundle()));
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('输入数组逆序后投影结果仍逐字节一致（顺序无关）', () => {
    const bundle = loadDemoTradeBundle();
    const baseline = JSON.stringify(projectScene(bundle));
    const reordered = {
      ...bundle,
      modelObject: [...bundle.modelObject].reverse(),
      modelRelation: [...bundle.modelRelation].reverse(),
      viewLayout: [...bundle.viewLayout].reverse(),
      evidence: [...bundle.evidence].reverse(),
      evidenceLink: [...bundle.evidenceLink].reverse(),
    };
    expect(JSON.stringify(projectScene(reordered))).toBe(baseline);
  });

  it('所有 paths 端点都指向已存在站点（无悬空）', () => {
    const projection = projectScene(loadDemoTradeBundle());
    const stationIds = new Set(projection.stations.map((station) => station.id));
    for (const path of projection.paths) {
      expect(stationIds.has(path.fromStationId)).toBe(true);
      expect(stationIds.has(path.toStationId)).toBe(true);
    }
  });

  it('决策分支保留条件标签（label 条件）', () => {
    const projection = projectScene(loadDemoTradeBundle());
    const labeled = projection.paths.filter((path) => path.label !== null);
    expect(labeled.length).toBeGreaterThan(0);
    expect(labeled.some((path) => path.label?.includes('折扣'))).toBe(true);
  });
});

/**
 * 泛化一致性校验：期望值一律**从 ModelBundle 派生**，不写死对象总数。
 * 这样当 fixture 增删对象（例如拆分 evidence）时，断言不会假失败。
 */
describe('投影与 ModelBundle 的结构一致性（不依赖对象总数）', () => {
  const bundle = loadDemoTradeBundle();
  const projection = projectScene(bundle);

  it('每个 modelObject 都具备最小必填字段（schema 泛化校验）', () => {
    expect(bundle.modelObject.length).toBeGreaterThan(0);
    for (const object of bundle.modelObject) {
      expect(typeof object.id).toBe('string');
      expect(object.id.length).toBeGreaterThan(0);
      expect(typeof object.kind).toBe('string');
      expect(typeof object.code).toBe('string');
      expect(object.code.length).toBeGreaterThan(0);
      expect(typeof object.state).toBe('string');
    }
  });

  it('actors/issues/artifacts/paths 的基数由 bundle 派生', () => {
    const roles = bundle.modelObject.filter((o) => o.kind === 'role');
    const problems = bundle.modelObject.filter((o) => o.kind === 'problem');
    const dataObjects = bundle.modelObject.filter((o) => o.kind === 'data_object');
    const flowTo = bundle.modelRelation.filter((r) => r.kind === 'flow_to');

    expect(projection.actors).toHaveLength(roles.length);
    expect(projection.issues).toHaveLength(problems.length);
    expect(projection.artifacts).toHaveLength(dataObjects.length);
    expect(projection.paths).toHaveLength(flowTo.length);
  });

  it('每个角色部门都被一个区域覆盖', () => {
    const departments = new Set(
      bundle.modelObject
        .filter((o) => o.kind === 'role')
        .map((role) => {
          const department = role.payload?.department;
          return typeof department === 'string' && department.trim().length > 0
            ? department.trim()
            : '未分组';
        }),
    );
    for (const department of departments) {
      expect(projection.regions.some((region) => region.department === department)).toBe(true);
    }
  });

  it('steps 与 cards 的基数由投影自身派生', () => {
    expect(projection.steps).toHaveLength(1 + projection.stations.length + projection.issues.length);
    expect(projection.cards).toHaveLength(
      projection.actors.length +
        projection.stations.length +
        projection.issues.length +
        projection.artifacts.length,
    );
  });

  it('每个投影实体的 sourceObjectId 都能在 bundle 中解析（引用完整性）', () => {
    const objectIds = new Set(bundle.modelObject.map((o) => o.id));
    const projected = [
      ...projection.actors,
      ...projection.stations,
      ...projection.issues,
      ...projection.artifacts,
    ];
    expect(projected.length).toBeGreaterThan(0);
    for (const item of projected) {
      expect(objectIds.has(item.sourceObjectId)).toBe(true);
    }
  });
});
