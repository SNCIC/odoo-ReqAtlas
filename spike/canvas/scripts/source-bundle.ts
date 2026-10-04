/**
 * 源 bundle 溯源工具（**仅 Node 侧脚本使用**，不进浏览器依赖图）。
 *
 * 提供**重算**（读真实字节）并与冻结锚点比对的 sha256；不一致直接抛错。
 * 由 `perf-adapter.ts`（写入产物）与 `browser-perf.ts`（注入 metadata 层）复用，
 * 避免两处各写一份锚点常量、或各写一份"照抄字面量"的恒真断言。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveFixturePath } from '@reqatlas/testkit/fixtures';

/** 冻结基线锚点：仅用于与**重算值**比对，绝不作产物取值直接写入。 */
export const FROZEN_SOURCE_BUNDLE_SHA256 =
  '1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62';

export type SourceBundleFingerprint = {
  /** 重算得到的 sha256 —— 这是应写入产物的值。 */
  sha256: string;
  /** 解析到的 fixture 绝对路径（仅进程内使用，**不要**写入产物）。 */
  fixturePath: string;
};

/** 读真实字节重算 sha256，并与冻结锚点比对；不一致抛错（而非静默通过）。 */
export function resolveFrozenSourceBundle(): SourceBundleFingerprint {
  const fixturePath = resolveFixturePath('demo-trade/model-bundle.json');
  const sha256 = createHash('sha256').update(readFileSync(fixturePath)).digest('hex');
  if (sha256 !== FROZEN_SOURCE_BUNDLE_SHA256) {
    throw new Error(
      `源 bundle 哈希与冻结基线不一致（fixture 可能已被改动）：\n  实际=${sha256}\n  冻结=${FROZEN_SOURCE_BUNDLE_SHA256}`,
    );
  }
  return { sha256, fixturePath };
}
