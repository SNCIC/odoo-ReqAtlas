/**
 * Node 侧数据源：通过 testkit 的**官方** fixture 加载器读取真实 bundle。
 *
 * testkit 的 fixture 解析以**模块位置**（`import.meta.url`）为基准（见
 * `packages/testkit/src/fixtures.ts`），与 `process.cwd()` 无关，因此任意包内的脚本
 * 都可直接调用；`loadFixtureBundle` 内部已用 `modelBundleSchema` 校验，
 * 故此处不再重复实现读取与校验。
 */
import { loadFixtureBundle } from '@reqatlas/testkit/fixtures';
import type { ModelBundle } from './domain';

export function loadDemoTradeBundleNode(): ModelBundle {
  return loadFixtureBundle('demo-trade');
}
