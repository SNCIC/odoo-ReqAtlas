import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelBundleSchema, type ModelBundle } from './model-bundle.schema';

/**
 * fixture 加载器。
 *
 * 解析以**模块位置**（`import.meta.url`）为基准，因此不依赖 `process.cwd()`：
 * 任意包内的脚本（如 `spike/document`）都可以直接调用。
 *
 * 解析顺序：
 * 1. 若设置了环境变量 `REQATLAS_FIXTURE_ROOT`，则**只**在该根目录下查找（显式覆盖）。
 * 2. 否则依次尝试：`<包>/fixtures`（模块位置，权威）、`<cwd>/fixtures`、`<cwd>/packages/testkit/fixtures`。
 */
export const FIXTURE_ROOT_ENV = 'REQATLAS_FIXTURE_ROOT';

const HERE_DIR = path.dirname(fileURLToPath(import.meta.url)); // packages/testkit/src
const PACKAGE_ROOT = path.resolve(HERE_DIR, '..'); // packages/testkit
const PACKAGE_FIXTURES = path.join(PACKAGE_ROOT, 'fixtures');

function candidateRoots(): string[] {
  const override = process.env[FIXTURE_ROOT_ENV]?.trim();
  if (override) {
    // 显式覆盖：唯一根，便于把任意脚本固定到指定 fixture 集
    return [path.resolve(override)];
  }
  const roots = [
    PACKAGE_FIXTURES, // 模块位置解析（与 cwd 无关）
    path.resolve(process.cwd(), 'fixtures'),
    path.resolve(process.cwd(), 'packages', 'testkit', 'fixtures'),
  ];
  return [...new Set(roots)];
}

/** 解析 fixture 相对路径为绝对路径；找不到时抛错并列出候选根目录。 */
export function resolveFixturePath(relativePath: string): string {
  const roots = candidateRoots();
  for (const root of roots) {
    const candidate = path.join(root, relativePath);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`fixture not found: ${relativePath} (looked under: ${roots.join(', ')})`);
}

/** 读取并 JSON.parse 一个 fixture。 */
export function readFixtureJson<T = unknown>(relativePath: string): T {
  return JSON.parse(readFileSync(resolveFixturePath(relativePath), 'utf8')) as T;
}

/** 读取并按 schema 校验一个 fixture bundle。 */
export function loadFixtureBundle(name: string): ModelBundle {
  const raw = readFixtureJson<unknown>(`${name}/model-bundle.json`);
  const parsed = modelBundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `fixture "${name}" failed schema validation: ${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  }
  return parsed.data;
}
