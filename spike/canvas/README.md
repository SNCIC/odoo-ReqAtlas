# @reqatlas/spike-canvas · M0-03 2D 画布 Spike

验证 2D 工作台的**编辑效率与渲染性能**，并证明 ADR-003 的核心约束：
React Flow **仅作视图适配层**，不承载业务真相。

## 一条命令启动

```powershell
pnpm --filter @reqatlas/spike-canvas dev
```

打开终端提示的地址（默认 `http://localhost:5199`）。页面无需后端。

## 数据来源（硬约束：同一 ModelBundle 驱动）

**唯一**数据源是真实 fixture：

```
packages/testkit/fixtures/demo-trade/model-bundle.json
sha256 = 1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62
```

页面**不含任何硬编码演示数据**：

- 浏览器：`src/bundle.ts` 直接 `import` 该 JSON 文件，并用 testkit 的 `modelBundleSchema` 校验。
- Node：`src/load-node.ts` 调用 `@reqatlas/testkit/fixtures` 的 `loadFixtureBundle('demo-trade')` 读取并校验同一文件（解析以模块位置 `import.meta.url` 为基准，与 `cwd` 无关）。
- 规模曲线由 `src/scale.ts` **程序化放大**同一 bundle（×6/×15/×30）得到，不是另造数据。
- 溯源：机器可读产物 `perf/adapter-results.json` 记录 `sourceBundleSha256`（由真实字节**重算**并与冻结锚点比对），可自证源自冻结基线。

### 类型与 Schema 的引入方式（重要）

- **类型**全部从 `@reqatlas/testkit` 转发（`src/domain.ts`），不复制、不重定义；schema 变化会立刻编译报错。
- **运行时 zod Schema** 从 `src/schema.ts` 引入，指向 testkit 的 `model-bundle.schema` 源文件。
  原因：testkit 的**包入口** `export *` 了依赖 `node:fs/node:path/node:url` 的 fixture 加载器，
  浏览器打包会因 `"fileURLToPath" is not exported by "__vite-browser-external"` 而构建失败（已实测）。
  两者是**同一个 Schema 对象**（同一源文件），并非复制。

## 架构

| 文件                                 | 职责                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/adapter.ts`                     | **Domain → React Flow 单向投影**：nodes（kind→形状/图标，sourceStatus→颜色）、edges（relation kind→线型/标签）、泳道。`node.id === model_object.id`（P1）。      |
| `src/changeset.ts`                   | **反向转换**：编辑事件 → §5.3 结构的 `ChangeSet`（`reason` / `source{type,referenceIds}` / `operations[]`，每个 operation 含 `operationId/op/targetType/targetId | tempId/before/after/sourceRefs/confidenceState`）。 |
| `src/scale.ts`                       | 程序化放大 bundle（保持 Schema 有效）。                                                                                                                          |
| `src/bundle.ts` / `src/load-node.ts` | 浏览器：JSON import + `modelBundleSchema` 校验；Node：`@reqatlas/testkit/fixtures` 的 `loadFixtureBundle` 读取并校验。                                           |
| `src/schema.ts`                      | 浏览器安全的 runtime Schema 引入点。                                                                                                                             |
| `src/ModelNode.tsx`                  | 唯一定制节点组件（形状/图标/颜色全部来自适配层投影的数据）。                                                                                                     |
| `src/perf/browser-probe.ts`          | 帧率 / 长任务 / 内存探针。                                                                                                                                       |
| `src/App.tsx`                        | 工作台页面：画布 + 属性面板 + ChangeSet 输出 + 性能面板。                                                                                                        |

### 语义隔离（ADR-003）

- 适配层是**单向投影**：`projectBundle()` 是纯函数（测试断言幂等 + 不修改输入）。
- **从不把 React Flow 的 JSON 持久化**。拖动节点产出 `view_layout` 操作、改标题产出
  `model_object` 操作，都以 `ChangeSet` 形式输出到页面/控制台（**不写库**）。
- 布局补丁 `bumpsRevision=false`，语义变更 `bumpsRevision=true`（ADR-003 §3.4）。

## 页面功能

- 节点：按 `kind` 区分形状与图标；边框/底色按 `sourceStatus`（推断类用虚线纹理——事实与推断分离）。
- 边：按 relation kind 分类着色/线型；`flow_to` 的 `label` 显示为条件标签。
- 泳道：角色泳道 + 辅助泳道（数据对象 / 系统 / 问题·需求）。
- 属性面板：显示选中对象的 ID / kind / code / title / state / sourceStatus / lane / payload / evidenceLink 数。
- 编辑 → ChangeSet：拖动节点、修改 title，实时生成 ChangeSet JSON；「打印到控制台」按钮输出到 devtools。
- 规模切换：真实 / ×6 / ×15 / ×30（放大副本禁用语义编辑，仅用于规模测量）。

## 验证命令

```powershell
pnpm --filter @reqatlas/spike-canvas typecheck   # tsc --noEmit
pnpm --filter @reqatlas/spike-canvas test        # vitest（13 用例）
pnpm --filter @reqatlas/spike-canvas build       # tsc --noEmit && vite build
```

## 性能测量（详见 PERF.md）

### Node 侧（适配层，无需浏览器）

```powershell
pnpm --filter @reqatlas/spike-canvas perf
```

打印 `projectBundle` 的 P50/P95（真实 / ×6 / ×15 / ×30），并写出
`spike/canvas/perf/adapter-results.json`。

### 浏览器侧（自动采集）

```powershell
pnpm --filter @reqatlas/spike-canvas build
pnpm --filter @reqatlas/spike-canvas exec playwright install chromium   # 首次需要
pnpm --filter @reqatlas/spike-canvas perf:browser
```

环境变量覆盖：`BENCH_SCALE`(1)、`BENCH_MODE`(`idle`|`pan`|`pan-zoom`)、`BENCH_DURATION`(5000)、
`BENCH_OUT`（写出纯 JSON 报告路径）。例如：

```powershell
$env:BENCH_SCALE='15'; $env:BENCH_MODE='pan-zoom'; $env:BENCH_OUT='perf/s15-panzoom.json'
pnpm --filter @reqatlas/spike-canvas perf:browser
```

原始报告见 `spike/canvas/perf/s*.json`，形状为 `{ metadata, payload }`：`metadata` 记录**重算**的源 bundle sha256（自证基线），`payload` 为浏览器探针报告。

### 人工观测步骤（无自动化时）

```powershell
pnpm --filter @reqatlas/spike-canvas dev
```

在右侧「性能探测（浏览器）」面板点击：

- **空转 3s** → 只渲染的 FPS；
- **平移压力 5s** → 合成平移（仅 x/y 振荡）；
- **缩放压力 5s** → 合成缩放（x/y + zoom 振荡，触发重新栅格化）。

面板显示 FPS 均值、帧时 P50/P95、最差 5% FPS、长任务、内存。
也可直接在地址栏用 `?bench=1&scale=30&mode=pan-zoom&duration=5000` 自动运行，
结果写入 `window.__canvasPerfReport`。

> 帧率/长任务/内存三类浏览器指标**已自动化采集**（见 PERF.md §3）。
> 唯一未验证项：**真实 GPU 桌面浏览器**的表现（headless 无法等价复现 GPU 合成）。
