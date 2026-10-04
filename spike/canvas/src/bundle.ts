/**
 * 浏览器侧数据源：**直接**引入真实 fixture，并用 testkit 的同一份 Zod Schema 校验。
 *
 * 这是「同一 ModelBundle 驱动」约束的落点：页面不存在任何硬编码演示数据，
 * 唯一的原始数据就是 `packages/testkit/fixtures/demo-trade/model-bundle.json`。
 */
import rawDemoTrade from '../../../packages/testkit/fixtures/demo-trade/model-bundle.json';
import type { ModelBundle } from './domain';
import { modelBundleSchema } from './schema';

export const DEMO_TRADE_FIXTURE = 'packages/testkit/fixtures/demo-trade/model-bundle.json';

/** 加载并校验 demo-trade bundle；校验失败时给出可读错误（不静默降级）。 */
export function loadDemoTradeBundle(): ModelBundle {
  const parsed = modelBundleSchema.safeParse(rawDemoTrade);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`demo-trade 未通过 testkit Schema 校验：${detail}`);
  }
  return parsed.data;
}
