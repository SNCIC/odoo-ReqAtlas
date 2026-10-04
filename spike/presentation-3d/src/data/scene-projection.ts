import sampleJson from '../../scene-projection.sample.json';
import { parseSceneProjection, type SceneProjection } from '../projection/scene-projection.schema';

/**
 * 浏览器侧渲染输入：由 `pnpm emit:sample` 从 demo-trade ModelBundle 确定性生成并提交。
 *
 * 产物文件同时含元数据 `sourceBundleSha256`（来源自证）；渲染只需要展示数据，
 * 故此处用 `parseSceneProjection` 解析，元数据字段会被丢弃（不影响 3D/2D）。
 * `sample.test.ts` 会断言产物与即时投影一致、且 `sourceBundleSha256` 等于源 bundle 重算哈希。
 */
export const demoSceneProjection: SceneProjection = parseSceneProjection(sampleJson);
