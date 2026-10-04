# M0-04 性能测量与结论（3D 导览 Spike）

> 原则（P7「阈值来自实测」）：本文件只记录**真实执行**得到的数据。
> 无法在当前环境自动化测量的项，一律标注「未验证（需人工观测）」，**不填任何编造数字**。

## 1. 测量环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows（本机开发机） |
| Node / pnpm | Node v25.2.1 / pnpm 10.32.1 |
| 构建器 | Vite 7.3.6（`pnpm --filter @reqatlas/spike-presentation-3d build`） |
| 目标浏览器 / 目标办公机 | **未在本次 Spike 中观测**（M0-01 目标设备表未在本包内提供） |

## 2. 已自动化的测量（可重复）

### 2.1 投影器耗时（Node，纯函数）

命令：`pnpm --filter @reqatlas/spike-presentation-3d exec tsx scripts/measure-projection.ts`
（预热 50 次后测量 500 次，`demo-trade` ModelBundle → SceneProjection）

```
{
  "iterations": 500,
  "minMs": 0.2594,
  "medianMs": 0.3006,
  "p95Ms": 0.6054,
  "maxMs": 2.4252,
  "projectionBytes": 21002
}
```

**结论**：投影本身亚毫秒级，不是瓶颈；可在渲染前即时计算，无需缓存。

### 2.2 前端产物体积（生产构建）

命令：`pnpm --filter @reqatlas/spike-presentation-3d build`

```
dist/index.html                 0.43 kB │ gzip:   0.30 kB
dist/assets/index-*.css         1.94 kB │ gzip:   0.79 kB
dist/assets/index-*.js      1,269.66 kB │ gzip: 349.24 kB │ map: 5,643.15 kB
```

场景数据 `scene-projection.sample.json`：**31,963 字节**（缩进 2 空格）。

**结论**：JS 体积几乎全部来自 three.js / R3F / drei（gzip ≈ 349 kB）。
对企业内网桌面端属可接受范围；3D 代码路径必须**按需加载**，不能让 2D 用户承担该体积。

### 2.3 场景复杂度（几何体数量，来自投影结果）

| 集合 | 数量 |
| --- | ---: |
| regions | 6 |
| actors | 6 |
| stations（流程节点） | 15 |
| paths（flow_to 连线） | 16 |
| issues | 2 |
| artifacts | 5 |

可拾取网格约 **34 个**、线对象 16 条，全部为基础几何体（box / sphere / cone / octahedron / tetrahedron / cylinder）。
**结论**：属「低多边形导览」量级，不构成绘制压力。

## 3. 未验证（需人工在目标设备观测）

以下数据**本次未采集**，因为本环境没有可用浏览器与目标办公机，无法自动测量。
应用内已内置实时 HUD（`src/components/PerfHud.tsx`），在 3D 模式下显示：

- **3D 首帧**：从组件挂载到 `Canvas` 首次就绪（`onCreated`）的耗时。
- **帧率**：连续 1 秒窗口的 `requestAnimationFrame` 帧数平均值。
- **JS 堆**：`performance.memory.usedJSHeapSize`（Chrome/Edge 可用；Firefox/Safari 不暴露时显示「不可用」）。

人工观测步骤：

1. `pnpm --filter @reqatlas/spike-presentation-3d dev`，用目标浏览器打开提示的本地地址。
2. 默认「自动」进入 3D；等待画面出现，读取右上 HUD 的「3D 首帧」。
3. 用鼠标旋转/平移/缩放 30 秒，记录 HUD「帧率」的稳态值与「JS 堆」。
4. 点击几个站点/角色/问题，确认拾取弹卡无卡顿。

> 本节所有具体数值：**未验证（待人工观测）**。

## 4. 明确结论与建议阈值

**结论：3D 在「企业桌面现代浏览器 + 低多边形导览」前提下可行。**
依据：几何体不足 60 个、投影耗时 < 1 ms、产物 gzip ≈ 349 kB；风险主要来自目标办公机的 GPU/WebGL 支持，
而非本 Spike 的场景复杂度。

建议阈值（**建议值，非实测**，需 M0-01 目标设备实测后由总指挥冻结写入 `performance-baseline.json`）：

| 指标 | 建议阈值 | 超限动作 |
| --- | --- | --- |
| 3D 首帧 | ≤ 2000 ms | 显示加载态；连续失败则降级 2D |
| 稳态帧率 | ≥ 30 fps | 自动降级 2D（可手动切回） |
| JS 堆增量（3D 会话） | ≤ 150 MB | 告警；复用几何体/材质，减少常驻对象 |
| WebGL 上下文 | 必须可获得 | 不可获得 → 自动降级 2D（已实现并有测试） |

**替代方案**：若目标设备普遍无法稳定 30 fps，则把 3D 从默认路径改为「可选增强」，
默认进入 2D 故事视图（ADR-004 §8 重新评估触发已覆盖该情形）。
