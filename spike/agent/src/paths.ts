import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 仓库内只读资源的定位。
 *
 * 以**模块位置**（`import.meta.url`）为基准，不依赖 `process.cwd()`，
 * 这样从任意工作目录运行脚本或测试都能找到契约目录。
 */

const HERE_DIR = path.dirname(fileURLToPath(import.meta.url)); // spike/agent/src

/** 仓库根目录（spike/agent/src → 上溯 3 级）。 */
export const REPO_ROOT = path.resolve(HERE_DIR, '..', '..', '..');

/** docs/api/schemas（契约唯一权威，只读）。 */
export const SCHEMAS_DIR = path.join(REPO_ROOT, 'docs', 'api', 'schemas');

/** 默认产物输出目录（仅本 Spike 使用，不写入任何业务库）。 */
export const OUT_DIR = path.resolve(HERE_DIR, '..', 'out');
