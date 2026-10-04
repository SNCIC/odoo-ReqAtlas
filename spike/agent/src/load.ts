import { loadFixtureBundle, resolveFixturePath, type ModelBundle } from '@reqatlas/testkit';
import { DEMO_TRADE_BUNDLE_RELATIVE_PATH } from './anchor';

/** 载入 demo-trade 冻结样本（经 testkit zod Schema 校验）。 */
export function loadDemoTradeBundle(): ModelBundle {
  return loadFixtureBundle('demo-trade');
}

/** demo-trade bundle 的绝对路径（用于哈希证据）。 */
export function demoTradeBundlePath(): string {
  return resolveFixturePath(DEMO_TRADE_BUNDLE_RELATIVE_PATH);
}
