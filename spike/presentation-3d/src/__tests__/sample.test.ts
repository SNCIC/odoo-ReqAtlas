import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseSceneProjection,
  sceneProjectionArtifactSchema,
} from '../projection/scene-projection.schema';
import { projectScene } from '../projection/project-scene';
import { readDemoTradeSource } from '../presentation/load-fixture';

const samplePath = fileURLToPath(new URL('../../scene-projection.sample.json', import.meta.url));

function readCommittedArtifact() {
  return sceneProjectionArtifactSchema.parse(
    JSON.parse(readFileSync(samplePath, 'utf8')) as unknown,
  );
}

describe('scene-projection.sample.json 产物（防漂移 + 来源自证）', () => {
  it('sourceBundleSha256 等于源 bundle 的重算哈希（自证源自冻结基线）', () => {
    const artifact = readCommittedArtifact();
    const { sha256 } = readDemoTradeSource();
    expect(artifact.sourceBundleSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.sourceBundleSha256).toBe(sha256);
  });

  it('产物的 SceneProjection 部分与即时投影逐字段一致（新字段不破坏防漂移）', () => {
    const artifact = readCommittedArtifact();
    expect(parseSceneProjection(artifact)).toEqual(projectScene(readDemoTradeSource().bundle));
  });

  it('sourceBundleSha256 位于元数据区，不混入 scene 集合', () => {
    const serialized = JSON.stringify(readCommittedArtifact());
    const hashIndex = serialized.indexOf('"sourceBundleSha256"');
    const cardsIndex = serialized.indexOf('"cards"');
    expect(hashIndex).toBeGreaterThan(-1);
    expect(cardsIndex).toBeGreaterThan(-1);
    expect(hashIndex).toBeLessThan(cardsIndex);
  });

  it('每个实体的 sourceObjectId 都能在 bundle 中解析（引用完整性）', () => {
    const artifact = readCommittedArtifact();
    const objectIds = new Set(readDemoTradeSource().bundle.modelObject.map((o) => o.id));
    const projected = [
      ...artifact.actors,
      ...artifact.stations,
      ...artifact.issues,
      ...artifact.artifacts,
    ];
    expect(projected.length).toBeGreaterThan(0);
    for (const item of projected) {
      expect(objectIds.has(item.sourceObjectId)).toBe(true);
    }
  });

  it('各集合非空且 id 唯一（不依赖对象总数）', () => {
    const artifact = readCommittedArtifact();
    const collections = [
      artifact.regions,
      artifact.actors,
      artifact.stations,
      artifact.paths,
      artifact.issues,
      artifact.artifacts,
      artifact.steps,
      artifact.cards,
    ];
    for (const collection of collections) {
      expect(collection.length).toBeGreaterThan(0);
      expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length);
    }
  });
});
