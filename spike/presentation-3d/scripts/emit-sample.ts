import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countSceneProjection,
  sceneProjectionArtifactSchema,
} from '../src/projection/scene-projection.schema';
import { projectScene } from '../src/projection/project-scene';
import { readDemoTradeSource } from '../src/presentation/load-fixture';

/**
 * 从 demo-trade ModelBundle 确定性生成场景投影产物。
 * 产物元数据区记录**重算**得到的源 bundle sha256，自证源自冻结基线。
 *
 * 用法：`pnpm --filter @reqatlas/spike-presentation-3d emit:sample`
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(here, '..', 'scene-projection.sample.json');

const { bundle, sha256 } = readDemoTradeSource();
const projection = projectScene(bundle);

// 元数据与展示数据分区；schema parse 会按定义顺序重建对象，使 sourceBundleSha256 与 projectRevision 并列。
const artifact = sceneProjectionArtifactSchema.parse({
  ...projection,
  sourceBundleSha256: sha256,
});

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(`wrote ${outPath}`);
console.log(`sourceBundleSha256 = ${sha256}`);
console.log(JSON.stringify(countSceneProjection(projection), null, 2));
