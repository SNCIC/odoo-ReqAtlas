/**
 * 浏览器安全的运行时 Zod Schema 引入点。
 *
 * 走 `@reqatlas/testkit/schema` **子路径**，而不是包入口 `@reqatlas/testkit`：
 * 包入口（src/index.ts）`export *` 了依赖 `node:fs/node:path/node:url` 的 `fixtures.ts`，
 * 浏览器打包时这些 node 内置模块会被 externalize 为 `__vite-browser-external` 占位符，
 * 导致 Rollup 报 `"fileURLToPath" is not exported` 而**构建失败**（已实测）。
 * 子路径 `./schema` 只导出纯 zod 的 `model-bundle.schema`，不含 Node-only 代码。
 *
 * 与包入口 re-export 的是**同一个源文件、同一个 Schema 对象**，并非复制或另写。
 * 类型仍全部来自 `./domain.ts`（转发 `@reqatlas/testkit`），schema 变化可被编译期捕获。
 */
export { modelBundleSchema } from '@reqatlas/testkit/schema';
