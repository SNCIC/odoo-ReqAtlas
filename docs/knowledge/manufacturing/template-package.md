# 行业模板包：离散制造

> **版本**：v0.1　**发布日期**：2026-10-04　**状态**：`draft`
> **评审**：需实施专家评审
> **内容定位**：模板候选，需客户核实。行业知识包提供调研参照，**不是客户事实**。
>
> 治理字段（名称版本 / 适用范围 / 内容负责人 / 评审状态 / 来源说明 / 有效期 / 变更日志 / 项目反馈）见 `README.md` §3。
> `package_id = mfg.generic`　`package_version = 0.1.0`

## 0. 适用范围

| 维度 | 说明 |
| --- | --- |
| 行业 | 离散制造（按件/按台装配，物料可拆分计数） |
| 细分场景 | 自有车间加工与装配为主，含委外加工工序；含来料质量管控 |
| 企业规模 | 中小企业（有计划、车间、质量、仓库、采购职能分工） |

预置重点：**采购收货与质检**、**计划到完工入库**——覆盖制造与供应链交界及车间内部闭环（对应实施方案 §11.1「制造作为第二样例」）。

> 与通用贸易包的关系：本包可独立使用，也可与 `trade.generic` 叠加；采购付款、销售开票等通用环节交叉引用贸易包，不重复定义。

## 1. 角色流程骨架

> 组成一。预置为可修改底稿；实例化后每条对象均为「模板候选」。

### 1.1 组织与岗位

| 岗位 | `template_origin` | 主要职责（模板候选） |
| --- | --- | --- |
| 生产计划 | `mfg.generic#role.planner` | 需求汇总、主计划、物料需求运算、排产、交期承诺 |
| 车间班组 | `mfg.generic#role.workshop` | 派工、领料、加工、报工、退料、返工/报废上报 |
| 质量检验 | `mfg.generic#role.qc` | 来料/过程/完工检验、判定、不良品隔离、质量追溯 |
| 仓库 | `mfg.generic#role.warehouse` | 收货、上架、线边仓、调拨、盘点、完工入库 |
| 采购 | `mfg.generic#role.purchase` | 请购、询比价、下单、跟交期、供应商管理 |
| 成本会计 | `mfg.generic#role.cost` | 标准成本、实际成本、差异归集与分摊、成本报表 |
| 工艺/技术 | `mfg.generic#role.engineering` | BOM、工艺路线、工作中心、工时定额维护与变更 |
| 设备/维修 | `mfg.generic#role.maintenance` | 设备点检、维修、停机记录（可选启用） |
| 审批人 | `mfg.generic#role.approver` | 超领、返工、报废、计划变更、委外等例外审批 |

> 提示：中小企业常一人多岗（如工艺兼计划、质检兼仓管）。访谈时须确认**实际承担者**，不能按岗位表假设。

### 1.2 主流程（两条端到端闭环）

**闭环 A：采购收货与质检（Procure-Receive-QC）**

| 步骤 | 触发 | 责任岗位 | `template_origin` |
| --- | --- | --- | --- |
| A1 请购 | 低库存/计划需求/人工 | 仓库/计划/需求部门 | `mfg.generic#flow.pq.01` |
| A2 询价/比价 | 请购批准 | 采购 | `mfg.generic#flow.pq.02` |
| A3 采购订单 | 选定供应商 | 采购（超权限转审批） | `mfg.generic#flow.pq.03` |
| A4 到货通知 | 供应商发货 | 采购/仓库 | `mfg.generic#flow.pq.04` |
| A5 收货点数 | 货物到达 | 仓库 | `mfg.generic#flow.pq.05` |
| A6 来料检验（IQC） | 收货完成 | 质量检验 | `mfg.generic#flow.pq.06` |
| A7 合格入库 / 不合格处置 | 检验判定 | 仓库/质量 | `mfg.generic#flow.pq.07` |
| A8 供应商发票与付款 | 入库后 | 采购/财务 | `mfg.generic#flow.pq.08`（交叉引用 `trade.generic#flow.p2p.06~08`） |

**闭环 B：计划到完工入库（Plan-to-Finished-Goods）**

| 步骤 | 触发 | 责任岗位 | `template_origin` |
| --- | --- | --- | --- |
| B1 需求汇总 | 销售订单/预测/备货 | 生产计划 | `mfg.generic#flow.pf.01` |
| B2 主计划与交期确认 | 需求明确 | 生产计划 | `mfg.generic#flow.pf.02` |
| B3 物料需求运算（MRP） | 主计划确认 | 生产计划 | `mfg.generic#flow.pf.03` |
| B4 缺料采购 / 自制计划 | 运算出需求 | 采购/计划 | `mfg.generic#flow.pf.04` |
| B5 排产与派工 | 物料齐套 | 生产计划/车间 | `mfg.generic#flow.pf.05` |
| B6 领料/发料 | 工单下达 | 仓库/车间 | `mfg.generic#flow.pf.06` |
| B7 首件检验 | 开工 | 质量/车间 | `mfg.generic#flow.pf.07` |
| B8 加工与报工 | 首件合格 | 车间 | `mfg.generic#flow.pf.08` |
| B9 过程/完工检验 | 工序完成/完工 | 质量检验 | `mfg.generic#flow.pf.09` |
| B10 完工入库 | 检验合格 | 仓库 | `mfg.generic#flow.pf.10` |
| B11 成本归集与差异分摊 | 工单关闭 | 成本会计 | `mfg.generic#flow.pf.11` |
| B12 返工/报废处置 | 检验不合格或加工异常 | 车间/质量 | `mfg.generic#flow.pf.12` |

> 交叉点：B3 缺料触发 A1；B6 领料依赖 A7 入库结果；B10 完工入库后进入销售发货与开票（交叉引用 `trade.generic`）；B11 成本依赖 B8 报工与 B6 领退料数据。

### 1.3 单据

| 单据 | 用途 | 关键字段（模板候选） | `template_origin` |
| --- | --- | --- | --- |
| BOM（物料清单） | 定义成品与半成品的用料 | 父项、子项、用量、损耗率、版本、生效日期 | `mfg.generic#doc.bom` |
| 工艺路线 | 定义加工工序顺序与工时 | 工序号、工作中心、标准工时、检验点 | `mfg.generic#doc.routing` |
| 工作中心 | 定义产能与费率 | 名称、设备、班次、日产能、工时费率 | `mfg.generic#doc.workcenter` |
| 生产工单（MO） | 一次生产任务 | 产品、数量、BOM 版本、工艺路线、开完工日期、状态 | `mfg.generic#doc.mo` |
| 领料单 | 向仓库领用原材料 | 工单号、物料、申请数量、实发数量、批次 | `mfg.generic#doc.issue` |
| 退料单 | 退回未用完物料 | 工单号、物料、数量、原因、批次 | `mfg.generic#doc.return` |
| 报工单 | 记录工序产出与工时 | 工单号、工序、合格数、不合格数、工时、报工人 | `mfg.generic#doc.workreport` |
| 检验单（来料/过程/完工） | 质量检验记录 | 检验类型、抽样方案、判定、不良数、处理意见 | `mfg.generic#doc.inspection` |
| 入库单（完工入库） | 成品/半成品入库 | 工单号、产品、数量、批次、库位、检验结论 | `mfg.generic#doc.fg_receipt` |
| 委外加工单 | 委外发料与收货 | 供应商、发料明细、加工费、损耗约定、收货明细 | `mfg.generic#doc.subcontract` |
| 返工单 | 记录返工任务与工时 | 原工单号、返工数量、返工工序、原因、工时 | `mfg.generic#doc.rework` |
| 报废单 | 记录不可用物料/成品 | 物料、数量、原因、责任、审批 | `mfg.generic#doc.scrap` |
| 成本计算单 | 归集与分摊成本 | 工单号、料工费、标准成本、实际成本、差异 | `mfg.generic#doc.cost_sheet` |
| 线边仓调拨单 | 车间线边库存转移 | 源库、线边库、数量、签收 | `mfg.generic#doc.line_side_transfer` |

## 2. 术语包

见同目录 [`terminology.md`](./terminology.md)。本包只定义制造专属术语；通用术语（库位、批次、序列号、盘点、调拨、三单匹配、暂估、红冲、账龄等）**交叉引用** [`../trade/terminology.md`](../trade/terminology.md)，不重复定义。

## 3. 典型痛点

见同目录 [`pain-points.md`](./pain-points.md)。用途：知道制造现场哪里值得深挖；痛点条目含征兆与追问方向。

## 4. 合规要点

见同目录 [`compliance-checklist.md`](./compliance-checklist.md)。用途：提醒需关注的记录与控制点（安全生产、特种设备、质量追溯、环保、职业健康等）；**提醒核实，不替代法律意见**。

## 5. 访谈话术

见同目录 [`interview-scripts.md`](./interview-scripts.md)。覆盖生产计划、车间班组、质量检验、仓库、采购、成本会计 6 个岗位。

## 6. 参考样例说明

> 组成六。通用演示数据，仅用于预习与产品演示。

- 参考样例为**中性化、虚构的示意数据**（如「某装配企业」），**不得**使用真实企业名、人名、真实金额或真实单据号。
- 用途：顾问在进现场前走一遍代表性制造场景；产品演示「模板 → 访谈 → 建模」链路。
- 样例中所有对象同样标注 `template_origin` 与「模板候选」，演示产生的对象不得直接进入客户基线。

### 6.1 参考样例清单（示意）

| 样例对象 | 用途 | `template_origin` |
| --- | --- | --- |
| 示意场景：来料不合格整批退回 | 演示采购收货与质检异常 | `mfg.generic#sample.iqc_reject` |
| 示意场景：缺料导致排产调整 | 演示计划到完工的阻断 | `mfg.generic#sample.shortage` |
| 示意场景：委外工序发料与收货 | 演示委外对账 | `mfg.generic#sample.subcontract` |
| 示意对象：两层 BOM 与联产品 | 演示成本卷积 | `mfg.generic#sample.bom_cost` |

## 变更日志

| 版本 | 日期 | 变更 | 理由 |
| --- | --- | --- | --- |
| v0.1 | 2026-10-04 | 首版：角色流程骨架、单据、术语/痛点/合规/话术索引、参考样例 | M4-02 第二个行业包（离散制造）初稿 |
