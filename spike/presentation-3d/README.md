# M0-04 Spike：3D 导览 + SceneProjection + 2D 降级

对应实施方案 §6.1（M0-04）、§6.8（M7 故事与 3D）、§7.1（前端专项）与
[ADR-004](../../docs/adr/ADR-004.md)（R3F + SceneProjection，低多边形导览，WebGL 不可用降级 2D）。

包名：`@reqatlas/spike-presentation-3d`（独占写入范围：`spike/presentation-3d/**`）。

## 一条命令启动

```bash
pnpm --filter @reqatlas/spike-presentation-3d dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5183`）。默认按「自动」探测 WebGL：
可用则进入 3D 导览，不可用则自动进入 2D 故事视图。

## 数据来源与确定性（M0 硬阻断项）

- **唯一数据来源**：`packages/testkit/fixtures/demo-trade/model-bundle.json`，
  经 `@reqatlas/testkit` 的 `parseModelBundle`（zod Schema）读取与校验（见 `src/presentation/load-fixture.ts`）。
- **投影器**：`src/projection/project-scene.ts` 从 ModelBundle **确定性**生成 `SceneProjection`：
  不使用时间、不使用随机、不依赖输入顺序（所有集合按与 locale 无关的键排序），坐标统一四舍五入。
- **证据**：`scene-projection.sample.json` 由投影器生成并提交；
  `src/__tests__/sample.test.ts` 断言已提交样本与即时投影**逐字段一致**（防漂移）。
- **展示布局不外写语义**：`regions/actors/stations/paths/...` 中的 `position/size/points` 只属展示布局，
  不写回任何业务对象（ADR-004 决策第 6 条）。

### 投影器用法

```ts
import {
  loadDemoTradeBundle,
  projectScene,
  parseSceneProjection,
} from '@reqatlas/spike-presentation-3d';

const bundle = loadDemoTradeBundle(); // 经 testkit Schema 校验的 ModelBundle
const projection = projectScene(bundle); // 确定性 SceneProjection
// 也可从任意 JSON 反序列化：parseSceneProjection(json)
```

重新生成样本证据：

```bash
pnpm --filter @reqatlas/spike-presentation-3d emit:sample
```

当前计数（`demo-trade`）：regions 6、actors 6、stations 15、paths 16、issues 2、artifacts 5、steps 18、cards 28。

> 说明：`stations` 覆盖全部流程节点 kind（activity 为主，含 start/end/decision/exception），
> 以保证 `paths`（`flow_to`）两端完整；仅有角色但没有 R/A 关系的流程节点归入「未分组」区域。

## SceneProjection 结构（zod 契约）

`src/projection/scene-projection.schema.ts`：

| 字段        | 来源                                      | 说明                                          |
| ----------- | ----------------------------------------- | --------------------------------------------- |
| `regions`   | `role.payload.department`（并集站点部门） | 区域；无部门归「未分组」                      |
| `actors`    | `kind=role`                               | 演员（低多边形标记）                          |
| `stations`  | 流程节点 kind                             | 站点，含主责角色与拓扑顺序                    |
| `paths`     | `flow_to`                                 | 路径，携带分支条件 `label` / `condition`      |
| `issues`    | `kind=problem`                            | 问题                                          |
| `artifacts` | `kind=data_object`                        | 交付物（produces/consumes 关联）              |
| `steps`     | 投影派生                                  | 故事步骤（总览 + 站点 + 问题），3D 与 2D 共用 |
| `cards`     | 投影派生                                  | 对象通俗卡，3D 拾取与 2D 列表共用             |

## 3D 场景

`src/components/Scene3D.tsx`（Three.js + React Three Fiber + Drei）：

- 轨道浏览：Drei `OrbitControls`（旋转 / 平移 / 缩放）。
- 拾取：点击区域/角色/站点/问题/交付物 → 右侧显示通俗说明卡（内容来自 `cards`）。
- 低多边形：基础几何体按 `stationKind` 着色，**不做**写实办公室 / 数字人 / 物理仿真。
- 性能 HUD：实时测量首帧耗时、帧率与 JS 堆（详见 [PERF.md](./PERF.md)）。

## 2D 降级（保留同一份步骤 / 旁白 / 对象卡）

降级逻辑：`src/presentation/render-mode.ts` + `src/presentation/webgl.ts`。

**触发方式**

1. 自动：WebGL 探测失败（或未完成探测）→ 进入 2D。
2. 手动：点击工具栏「2D 故事（降级）」。
3. 强制模拟无 WebGL（浏览器 DevTools Console 执行后刷新）：

```js
HTMLCanvasElement.prototype.getContext = () => null;
```

**验证方法**

- 页面顶部 `mode-reason` 会显示降级原因；2D 视图列出**全部** `steps` 与 `cards`。
- 自动化证据：`pnpm --filter @reqatlas/spike-presentation-3d test` 中的 `fallback.test.tsx`：
  - `resolveRenderMode` 覆盖「不可用/未探测/手动」各分支；
  - `detectWebglSupport` 用桩对象模拟禁用 WebGL；
  - 用 `react-dom/server` 渲染 `PresentationRoot`（`webgl=false`）并断言**每个**步骤标题、旁白、
    对象卡说明都出现在 2D 输出中（内容不丢失）。

## 文本等价（3D 不承载独占信息）

`src/presentation/text-equivalent.ts` + `src/components/TextEquivalent.tsx`：
把区域 / 角色 / 站点 / 路径 / 问题 / 交付物 / 步骤以列表形式完整表达，工具栏「文本等价」可展开。
测试断言文本等价覆盖全部实体与步骤。

## 验证命令

```bash
pnpm --filter @reqatlas/spike-presentation-3d typecheck        # tsc --noEmit
pnpm --filter @reqatlas/spike-presentation-3d lint             # eslint src scripts
pnpm --filter @reqatlas/spike-presentation-3d test             # vitest run（确定性/降级/文本等价/样本）
pnpm --filter @reqatlas/spike-presentation-3d build            # tsc --noEmit && vite build
pnpm --filter @reqatlas/spike-presentation-3d emit:sample      # 重新生成场景投影证据
pnpm --filter @reqatlas/spike-presentation-3d exec tsx scripts/measure-projection.ts  # 投影耗时实测
```

## 目录结构

```text
spike/presentation-3d/
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├─ scene-projection.sample.json      # 确定性投影证据
├─ PERF.md                           # 实测 + 未验证项 + 结论/阈值建议
├─ scripts/
│  ├─ emit-sample.ts                 # 生成 scene-projection.sample.json
│  └─ measure-projection.ts          # 投影耗时实测
└─ src/
   ├─ projection/
   │  ├─ scene-projection.schema.ts  # zod 契约（核心）
   │  └─ project-scene.ts            # 确定性投影器（核心）
   ├─ presentation/                  # 非 React：render-mode / webgl / text-equivalent / load-fixture
   ├─ components/                    # Scene3D / Story2D / TextEquivalent / ObjectCardView / PerfHud / PresentationRoot
   ├─ data/scene-projection.ts       # 浏览器渲染输入（引用已提交样本）
   ├─ App.tsx / main.tsx / styles.css
   └─ __tests__/                     # determinism / sample / schema / fallback
```

## 范围边界（本 Spike 明确不做）

- 不做写实资产、数字人、物理仿真、3D 精确编辑（§1.2 首版不做）。
- 不做故事线**编辑**（M7-04）与镜头预设（M7-03）：本 Spike 只证明机制与降级。
- 不引入 CRDT / 多人共游；坐标不写回领域模型。
