# 领域校验规则（接口级表达）

权威来源：开发方案附录 C「首版领域校验规则」（12 条）。本文件只描述这些规则**如何出现在接口响应中**，
不重复领域实现细节。规则实现属于 M2（§6.3 M2-05）与 M5（§6.5）。

## 1. 规则的统一表达

所有规则命中统一使用 **finding** 结构（见 `schemas/change-draft.json#/$defs/finding`）：

```json
{
  "ruleCode": "FLOW_NO_END",
  "severity": "block",
  "objectIds": ["tmp_activity_1", "act_2"],
  "message": "流程无可达结束节点。"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ruleCode` | string | 稳定规则码（下表 12 个） |
| `severity` | string | `block` \| `error` \| `warn` |
| `objectIds` | string[] | 命中的对象/关系 ID；可为 `tempId`（尚未落库的草案操作） |
| `message` | string | 面向用户的可读说明，须给出下一步线索 |

## 2. 规则出现的位置

| 出现位置 | 语义 | 结构 |
| --- | --- | --- |
| `422 DOMAIN_RULE_BLOCKED` | 写入被阻断（含 `block`/`error` 级 finding） | `problem.context.findings[]` |
| ChangeDraft `validation.blocking` | 草案中的阻断项（非空则不可 apply） | finding 数组 |
| ChangeDraft `validation.warnings` | 草案告警项（可 apply，需人工确认） | finding 数组 |
| `POST /change-drafts/{id}/validate` 响应 | 重跑校验的结果（HTTP 200 返回，不是错误） | `data.findings[]` + `data.blocking` |

阻断规则失败时，ChangeSet 整体回滚，不允许半成功（§5.3、§4.4）。`warn` 级规则不阻断应用。

## 3. 规则清单（12 条）

| # | ruleCode | severity | 触发条件 | 主要出现位置 |
| --- | --- | --- | --- | --- |
| 1 | `FLOW_NO_END` | block | 流程无可达结束节点 | 422（change-sets/apply/snapshots） |
| 2 | `DECISION_NO_CONDITION` | error | 决策出口缺少条件标签 | 422 / validate |
| 3 | `EXCEPTION_NO_TARGET` | error | 异常节点无去向 | 422 / validate |
| 4 | `ACTIVITY_NO_R` | block | 事项无执行负责 R | 422（change-sets/apply/snapshots） |
| 5 | `ACTIVITY_MULTI_A` | error | 事项存在多个最终负责 A | 422 / validate |
| 6 | `HANDOFF_NO_OBJECT` | warn | 跨岗位交接未说明传递物 | validate `warnings` / 草案 `validation.warnings` |
| 7 | `REQUIREMENT_NO_SOURCE` | block | 目标需求无事实/问题/合规来源 | 422（apply/snapshots） |
| 8 | `OBJECT_NO_EVIDENCE` | warn | 关键事实无证据引用 | validate `warnings` / 草案 `validation.warnings` |
| 9 | `AGENT_ASSUMPTION` | block | Agent 假设（assumption）尝试进入基线 | 422（apply）/ 草案 `validation.blocking` |
| 10 | `CROSS_PROJECT_REFERENCE` | block | 对象跨项目引用 | 422（change-sets/apply） |
| 11 | `STALE_CONFIRMATION` | block | 确认绑定的是旧 `object_rev` | 422（apply/snapshots） |
| 12 | `SENSITIVE_EXPORT` | block | 无权限导出敏感内容 | 422（snapshots / 文档预检） |

## 4. 逐条接口级说明

### FLOW_NO_END（block）
- 触发：场景内流程从 `start` 出发不存在可达 `end`。
- 响应：`422 DOMAIN_RULE_BLOCKED`，`context.findings[].objectIds` 给出涉及的流程对象。
- 客户端动作：定位缺失的结束节点/断链，修复后重新提交，不重试原请求。

### DECISION_NO_CONDITION（error）
- 触发：`decision` 出口缺少条件标签（对应 `model_relation.label` 为空）。
- 响应：`422` 或 `validate` 的 findings。

### EXCEPTION_NO_TARGET（error）
- 触发：`exception` 对象无 `has_exception`/`flow_to` 等去向关系。

### ACTIVITY_NO_R（block）
- 触发：`activity` 未通过 `performs_R` 关联任何 `role`。

### ACTIVITY_MULTI_A（error）
- 触发：同一 `activity` 存在多个 `accountable_A` 端点。

### HANDOFF_NO_OBJECT（warn）
- 触发：跨岗位泳道连线未指定传递的数据对象/单据。
- 响应：仅出现在 `warnings`，不阻断 apply。

### REQUIREMENT_NO_SOURCE（block）
- 触发：`requirement` 无法追溯到至少一个 `current_fact` / `problem` / 合规来源。

### OBJECT_NO_EVIDENCE（warn）
- 触发：关键事实型对象无 `evidence_link` 引用。

### AGENT_ASSUMPTION（block）
- 触发：草案 `assumptions` 中的内容被尝试写入基线（来源状态为 `agent_inference` 且未被确认）。
- 响应：`POST /change-drafts/{id}/apply` 返回 `422`；草案 `validation.blocking` 也会标记。

### CROSS_PROJECT_REFERENCE（block）
- 触发：操作引用了其他项目的对象 ID（违反项目隔离，§4.3）。

### STALE_CONFIRMATION（block）
- 触发：确认绑定的 `object_rev` 与对象当前 `object_rev` 不一致（§4.2 确认失效机制）。

### SENSITIVE_EXPORT（block）
- 触发：无导出权限的敏感对象被纳入快照/文档导出。
- 响应：`POST /snapshots` 或文档预检返回 `422`；客户端应提示所需授权，而非重试。

## 5. 与错误码的关系

- 存在 `block`/`error` 级 finding → 写入返回 `422 DOMAIN_RULE_BLOCKED`，`problem.code` 为该错误码，
  具体规则在 `problem.context.findings[]`。
- 仅存在 `warn` 级 finding → 不返回错误，随草案/校验结果以 `warnings` 返回。
- 新增规则码属于契约变更，须先登记到本文件与 `schemas`，再实现（见 `README.md` §5、§6）。
