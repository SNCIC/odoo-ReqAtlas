# 模板样例键名映射与实例化状态（testkit fixtures ↔ trade.generic）

> 目的：记录 testkit 的**具体 fixture** 如何对应到知识包 `docs/knowledge/trade/template-package.md`
> 的模板项键，并维护实例化状态。
>
> 权威来源：`docs/knowledge/**`（`package_id = trade.generic`，`package_version = 0.1.0`）。
> 本文件由测试侧 `sample` 维护，**不复制模板定义**；引用方向单向：fixture → 知识包。

## 1. 实例化状态（本表为权威，测试侧维护）

| item_key（权威，knowledge）          | 场景                            | testkit 资产                                                               | 状态                                    |
| ------------------------------------ | ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `trade.generic#sample.q2c`           | 客户询价到发货（quote-to-cash） | `fixtures/demo-trade/model-bundle.json`（`PRJ-TRADE-001`）                 | **instantiated**（M0 金样例）           |
| `trade.generic#sample.credit_block`  | 超信用额度拦截                  | demo-trade 分支 `DEC-002` / `EXC-002` / `ACT-009`（`EXC-002` 带该键）      | **partial**（复用，无独立 fixture）     |
| `trade.generic#sample.p2p`           | 低库存触发采购                  | 无（demo-trade 仅含 `ROLE-005` 采购，consulted_C）                         | **planned**（延后，见触发条件）         |
| `trade.generic#sample.short_receipt` | 收货数量短缺处理                | `fixtures/demo-manufacturing/model-bundle.json` 的 `EXC-101`（质检不合格） | **partial**（近似覆盖，无独立 fixture） |

**状态取值**：`instantiated`（已实例化）/ `partial`（近似或复用）/ `planned`（尚未实例化）。

**已裁定（team-lead，2026-10-04）**：

- **不建** `p2p` / `short_receipt` 独立 fixture，延后。理由：ModelBundle 契约尚未冻结；
  实施方案 §8.5 金样例清单本只有 `demo-trade` + `demo-manufacturing`。
  触发条件：契约冻结 + M4-01 需验证「采购到付款」闭环。
- `credit_block` 继续复用 demo-trade 分支，不建独立 fixture。
- `short_receipt` 的「近似覆盖（`EXC-101` 质检不合格）」标注**放在本文件**（测试侧），不进知识包。

## 2. 对象级 `templateOrigin` 约定

字段为**嵌套结构**并**逐对象区分**（修正「全部相同」缺陷）：

```json
"payload": {
  "templateOrigin": { "packageId": "trade.generic", "itemKey": "trade.generic#role.sales" },
  "templateCandidate": false
}
```

- **只有**在知识包中确有对应模板项的对象才写 `templateOrigin`；试点特有对象**省略**该字段（不编造键名）。
- `templateCandidate` 语义：**仅**「模板预置且尚未核实」的对象为 `true`；
  已确认对象（`state` 为 `confirmed`/`approved`）必须为 `false` 或省略。
  二者由校验规则 `TEMPLATE_CANDIDATE_CONFIRMED`（block）强制。

### 2.1 对象 → 模板项 映射（demo-trade）

| 对象                   | `templateOrigin.itemKey`            |
| ---------------------- | ----------------------------------- |
| `ROLE-001` 销售员      | `trade.generic#role.sales`          |
| `ROLE-002` 销售经理    | `trade.generic#role.approver`       |
| `ROLE-003` 财务        | `trade.generic#role.finance`        |
| `ROLE-004` 仓库        | `trade.generic#role.warehouse`      |
| `ROLE-005` 采购        | `trade.generic#role.purchase`       |
| `ACT-001` 登记询价     | `trade.generic#flow.q2c.01`         |
| `ACT-002` 编制报价     | `trade.generic#flow.q2c.02`         |
| `ACT-005` 创建销售订单 | `trade.generic#flow.q2c.03`         |
| `ACT-004` 信用检查     | `trade.generic#flow.q2c.04`         |
| `ACT-006` 仓库发货     | `trade.generic#flow.q2c.05`         |
| `ACT-007` 开票         | `trade.generic#flow.q2c.06`         |
| `ACT-008` 回款登记     | `trade.generic#flow.q2c.07`         |
| `DO-001` 报价单        | `trade.generic#doc.quotation`       |
| `DO-002` 销售订单      | `trade.generic#doc.so`              |
| `DO-003` 发票          | `trade.generic#doc.ar_invoice`      |
| `DO-004` 发货单        | `trade.generic#doc.delivery`        |
| `DO-005` 银行回款记录  | `trade.generic#doc.receipt`         |
| `EXC-002` 信用不足     | `trade.generic#sample.credit_block` |

**省略 `templateOrigin`**（试点特有，模板无对应项）：`START-001`、`END-001`、`ACT-003`（折扣审批阈值）、
`ACT-009`（信用/逾期特批）、`DEC-001`（折扣阈值判断）、`DEC-002`（逾期判断）、`EXC-001`（审批超时）、
`ROLE-006`（客户）、`SYS-001`/`SYS-002`、`PROB-001`/`PROB-002`、`REQ-001`/`REQ-002`/`REQ-003`。

## 3. 引用方向与 `fixture_ref`（已裁定）

- `template_origin` 权威在**知识包**（本包条目键）；fixture 侧记 `templateOrigin` 指向知识包。
- 知识包**不**反向引用测试资产路径；`fixture_ref` 字段**被否决**（产品内容不耦合测试资产路径，
  避免依赖反转）。因此知识包 §6 不加 `fixture_ref`，两侧键名也无需互相改。
- 单向引用：fixture → 知识包；知识包只被读，不被 fixture 修改。

## 4. 红线合规

| 红线                 | 本样例做法                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 模板候选语义正确     | 仅未核实对象 `templateCandidate=true`；已确认对象为 `false`/省略（`TEMPLATE_CANDIDATE_CONFIRMED` block 门禁）         |
| 中性化虚构数据       | 角色/岗位为通用职能（销售员、财务…），项目 `PRJ-TRADE-001`，单据 `DO-001` 等为编号占位，无真实企业名/人名/金额/单据号 |
| 不得直接进入客户基线 | fixture 位于 `packages/testkit/fixtures/**`，仅被单测与 Spike 读取，不写入任何客户基线                                |

## 5. 已知缺口

模板预置内容在 `sourceStatus` 枚举中无对应取值（现被迫填 `agent_inference`）。
详见 `docs/pilot/model-bundle-open-questions.md`（OQ-1，待总指挥裁定）。
