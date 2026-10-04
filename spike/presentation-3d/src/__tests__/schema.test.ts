import { describe, expect, it } from 'vitest';
import {
  parseSceneProjection,
  sceneProjectionSchema,
} from '../projection/scene-projection.schema';
import { projectScene } from '../projection/project-scene';
import { loadDemoTradeBundle } from '../presentation/load-fixture';

const projection = projectScene(loadDemoTradeBundle());

describe('SceneProjection Schema', () => {
  it('投影结果通过 Schema 校验', () => {
    expect(() => parseSceneProjection(projection)).not.toThrow();
  });

  it('拒绝非法站点种类', () => {
    const broken = {
      ...projection,
      stations: [{ ...projection.stations[0], stationKind: 'not-a-kind' }],
    };
    expect(sceneProjectionSchema.safeParse(broken).success).toBe(false);
  });

  it('拒绝缺失 schemaVersion 的输入', () => {
    const { schemaVersion: _omitted, ...rest } = projection;
    expect(sceneProjectionSchema.safeParse(rest).success).toBe(false);
  });

  it('各集合 id 唯一', () => {
    const unique = (ids: string[]): boolean => new Set(ids).size === ids.length;
    expect(unique(projection.regions.map((item) => item.id))).toBe(true);
    expect(unique(projection.actors.map((item) => item.id))).toBe(true);
    expect(unique(projection.stations.map((item) => item.id))).toBe(true);
    expect(unique(projection.paths.map((item) => item.id))).toBe(true);
    expect(unique(projection.issues.map((item) => item.id))).toBe(true);
    expect(unique(projection.artifacts.map((item) => item.id))).toBe(true);
    expect(unique(projection.cards.map((item) => item.id))).toBe(true);
  });
});
