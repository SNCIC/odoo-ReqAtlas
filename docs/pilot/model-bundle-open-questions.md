# ModelBundle 待裁定问题清单

> 状态：**待总指挥裁定**（本文件只记录，不修改 Schema，不绕过）。
> 归属：测试侧文档，由 `sample` 维护；与产品/知识包内容解耦。

## OQ-1：`sourceStatus` 缺少「模板预置」取值

### 1. 缺口描述

`model_object.source_status` 的六个枚举值（实施方案 §4.2）为：

`user_statement` / `material_extracted` / `consultant_judgment` / `agent_inference` / `confirmed_fact` / `approved_requirement`

其中**没有任何一个**表示「由行业模板预置、尚未经客户核实」。

但知识包的设计要求（`docs/knowledge/trade/template-package.md` §0/§1.1/§6.1）明确：
模板实例化后产生的对象属于「模板候选」，其来源是**模板预置**——这既不是用户陈述，也不是材料提取、
不是顾问判断、不是 Agent 推断，也不是已确认事实/已批准需求。

结论：**缺口真实存在**——「模板预置」在当前来源枚举中无对应取值。

### 2. 实测证据（`demo-trade` 真实数据）

`demo-trade` 中带 `templateCandidate=true`（尚未核实、且有 `templateOrigin`）的对象如下——它们被迫
填写了并不语义对应的 `sourceStatus`：

| 对象                  | state                  | 真实来源 | 当前被迫填写的 `sourceStatus` | `templateOrigin.itemKey`            |
| --------------------- | ---------------------- | -------- | ----------------------------- | ----------------------------------- |
| `EXC-002` 信用不足    | `pending_confirmation` | 模板预置 | `agent_inference`             | `trade.generic#sample.credit_block` |
| `DO-005` 银行回款记录 | `draft`                | 模板预置 | `agent_inference`             | `trade.generic#doc.receipt`         |

- 两个模板候选对象都只能借 `agent_inference` 表示「模板预置」——但 `agent_inference` 的含义是
  **Agent 推断**，与「模板预置」是两种不同的来源，会误导 M5（受控 Agent）的溯源与置信度判断。
- 其余带 `templateOrigin` 且已确认的对象（角色 / 流程活动 / 单据样张）使用
  `confirmed_fact` / `material_extracted` / `user_statement`，尚不暴露问题；
  **问题集中在「候选态」对象**。

### 3. 影响面

| 影响对象                                       | 说明                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| ModelBundle 契约                               | `sourceStatus` 枚举若扩展，属契约变更，需前端/服务端/生成客户端同步  |
| M2 Schema 定义（`model_object.source_status`） | Drizzle 迁移与兼容升级策略需同步；历史数据需回填                     |
| M2 差异/溯源                                   | 差异视图按来源区分「事实 vs 推断」；模板预置需独立可辨               |
| M5 受控 Agent                                  | `agent_inference` 被复用会污染 Agent 溯源与 `confidence_state`       |
| M6 基线门禁 / M8 文档预检                      | 「未确认项必须标注」需能区分「模板预置未核实」与「Agent 推断未核实」 |

### 4. 建议选项（供裁定，未生效）

- **选项 A（推荐）：新增枚举值 `template_seeded`** —— 语义最清晰，改动可控（一条迁移 + 契约升级），
  与 `templateCandidate` / `templateOrigin` 天然配套。
- **选项 B：允许模板草稿态 `sourceStatus = null`** —— 表达「来源尚未确定」，
  但会打破「所有写入必须有来源」的既有约束，影响面更大。
- **选项 C：维持现状，用 `templateCandidate` 区分** —— 零契约改动，
  但 `sourceStatus` 仍然误导（模板预置伪装成 Agent 推断），不推荐。

### 5. 为什么需要总指挥裁定（而非本工作流自行决定）

1. 这是**跨里程碑契约变更**（ModelBundle + M2 Schema + M5/M6/M8 语义），不属于 M0-01 的 bounded scope。
2. 改动会**扩散到其他 workstream**（contracts / domain / db / web），需统一排期与兼容策略。
3. 涉及**产品语义裁定**（产品设计文档 §9.3 知识边界、附录 F 术语表），应由产品/总指挥确认口径。
4. 按硬规则「不扩张范围」，本工作流**只记录、不改**。

### 6. 当前处置（未修复）

- **未**修改 `sourceStatus` 枚举。
- **未**修改 `packages/testkit` 的 Schema 去绕过该缺口。
- 模板候选对象暂时沿用 `agent_inference`，并在本文件登记为**待裁定**。
- 一旦裁定为选项 A，`sample` 将把 `EXC-002` / `DO-005` 的 `sourceStatus` 改为 `template_seeded` 并同步 Schema。
