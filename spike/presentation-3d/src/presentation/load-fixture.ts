import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModelBundle, resolveFixturePath, type ModelBundle } from '@reqatlas/testkit';

/**
 * 唯一数据来源：`packages/testkit/fixtures/demo-trade/model-bundle.json`。
 *
 * - 优先使用 `@reqatlas/testkit` 的 `resolveFixturePath`（当 cwd 允许时）。
 * - 否则从仓库根目录（含 pnpm-workspace.yaml）定位同一文件。
 * - 两种路径都用 `@reqatlas/testkit` 的 `parseModelBundle` Schema 校验。
 * - 同时从**原始字节**重算 sha256，供产物记录来源（禁止抄常量）。
 */

export const DEMO_TRADE_FIXTURE = 'demo-trade/model-bundle.json';
const DEMO_TRADE_FIXTURE_REPO_PATH = [
  'packages',
  'testkit',
  'fixtures',
  'demo-trade',
  'model-bundle.json',
];

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`repo root not found above ${startDir}`);
}

/** 从仓库根目录解析一个相对路径（便于脚本/测试定位已提交产物）。 */
export function resolveRepoFile(...segments: string[]): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(findRepoRoot(here), ...segments);
}

/** 解析 demo-trade fixture 的文件路径（优先 testkit 解析器，回退到仓库根定位）。 */
export function resolveDemoTradeFixtureFile(): string {
  try {
    return resolveFixturePath(DEMO_TRADE_FIXTURE);
  } catch {
    return resolveRepoFile(...DEMO_TRADE_FIXTURE_REPO_PATH);
  }
}

export interface DemoTradeSource {
  /** 源 ModelBundle 文件绝对路径。 */
  file: string;
  /** 源 ModelBundle 原始字节的 sha256（每次重算，非常量）。 */
  sha256: string;
  /** 经 testkit Schema 校验后的 bundle。 */
  bundle: ModelBundle;
}

/** 读取 demo-trade 源：重算字节哈希 + testkit Schema 校验。 */
export function readDemoTradeSource(): DemoTradeSource {
  const file = resolveDemoTradeFixtureFile();
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const bundle = parseModelBundle(JSON.parse(bytes.toString('utf8')) as unknown);
  return { file, sha256, bundle };
}

/** 读取 demo-trade ModelBundle，并经 testkit Schema 校验后返回。 */
export function loadDemoTradeBundle(): ModelBundle {
  return readDemoTradeSource().bundle;
}
