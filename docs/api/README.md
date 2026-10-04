# API 契约（`docs/api`）

本目录是 M0-06 产出的**契约先行草案**，覆盖《需求调研工作台-具体实施方案》v1.0 §5
（接口契约落地）的通用协议、路由与三条关键写入链路。

## 1. 定位：契约是唯一事实源的派生入口

- 唯一事实源是统一语义模型（对象/关系/修订/快照）。
- 前端、2D/3D 画布、Agent、文档都**不得**各自保存一套业务事实。
- 本目录的 OpenAPI 与 JSON Schema 是把该模型对外的**派生入口**：客户端类型必须由契约生成，
  禁止手写请求/响应类型（实施方案 P5、§5.4）。
- 参考实现权威定义（运行时 `ModelBundle`）在 `packages/testkit/src/model-bundle.schema.ts`，
  本目录只持有引用，不复制字段细节，见 `schemas/model-bundle.ref.json`。

## 2. 文件索引

| 文件 | 内容 |
| --- | --- |
| `openapi.yaml` | OpenAPI 3.1，13 个 M0/M2 起始端点 + 通用协议 |
| `schemas/error-code.json` | 稳定错误码枚举（开发方案附录 A） |
| `schemas/problem.json` | RFC 9457 `application/problem+json` 错误体 |
| `schemas/change-set.json` | ChangeSet / ChangeOperation 契约 |
| `schemas/change-draft.json` | Agent 结构化输出契约（产品设计文档附录 C） |
| `schemas/agent-run.json` | AgentRun 请求与状态机 |
| `schemas/model-bundle.ref.json` | ModelBundle 的引用说明（不重复定义） |
| `examples/change-set-request.json` | §5.3 手工建模链路示例 |
| `examples/change-draft-response.json` | §5.3 Agent 链路示例 |
| `examples/problem-revision-conflict.json` | 409 `REVISION_CONFLICT` 示例 |
| `events.md` | SSE 事件契约（鉴权、重连游标、去重） |
| `domain-rules.md` | 12 条领域校验规则的接口级表达 |
| `open-questions.md` | 待总指挥/产品负责人裁定的契约开放问题登记 |

## 3. 通用协议（§5.1）

| 项 | 裁定 |
| --- | --- |
| Base URL | `/api/v1` |
| 格式 | JSON UTF-8；文件走预签名上传 |
| 认证 | OIDC Access Token（bearer）；校验 issuer / audience |
| 并发 | 语义写入必须 `If-Match: "rev-{n}"` |
| 幂等 | POST / 命令必须 `Idempotency-Key` |
| 追踪 | 所有响应返回 `X-Request-Id` |
| 分页 | `cursor` + `limit`，禁止 offset |
| 错误 | `application/problem+json` + 稳定 `code` |
| 异步 | `202` + `jobId`，状态经 SSE 推送 |
| 成功包装 | `{ data, meta: { requestId, projectRevision } }` |

## 4. 契约先行工作流（§5.4）

1. **先改契约**：在 OpenAPI / JSON Schema 中修改；同步提交示例请求/响应。
2. **再生成客户端**：由契约生成类型与客户端；CI 要求生成结果 `git diff` 为空。
3. **后实现**：后端实现路由，前端消费生成客户端；禁止手写请求类型。
4. **契约测试**：示例必须可解析并通过 Schema 校验（见第 7 节命令）。

修改顺序固定为 **OpenAPI/JSON Schema → 生成客户端 → 实现**，不得反向。

## 5. `/v1` 语义稳定性

- `/v1` 内**不得静默修改语义**：字段含义、枚举值、错误码、幂等/并发语义的变化都属于破坏性变更。
- 允许的非破坏性变更：新增可选字段、新增端点、新增错误码（须先登记）。
- 破坏性变更流程：
  1. 写变更单（目的、影响、替代方案、迁移、验收）。
  2. 先更新契约与生成客户端，再改实现。
  3. 需要不兼容时，升版本段（如 `/v2`）或提供过渡期，不在 `/v1` 内原地改。
- 本目录内的自定义扩展（`x-*`）仅供文档辅助，不构成新的协议语义。

## 6. 契约与实现不一致时的处置

**以契约为准。** 一旦发现实现与契约不符：

1. **停止**继续实现该行为，避免扩散。
2. 判定哪一方正确：
   - 若契约正确 → 修实现。
   - 若契约有误 → 走变更单更新契约与客户端，禁止先改实现后补契约。
3. 无法当场判定时，提交变更单，由总指挥/产品负责人裁定；`/v1` 内不得"先实现、后补契约"。

## 7. 验证命令

> 说明：本目录 Schema 使用 JSON Schema 2020-12，需 `ajv-cli --spec=draft2020`；
> 跨文件引用需 `-r` 显式注册被引用 Schema。Redocly 使用内置 `recommended` 规则集。

```powershell
# 1) OpenAPI lint（必须 0 error 0 warning）
npx --yes @redocly/cli@latest lint docs/api/openapi.yaml

# 2) 示例对 Schema 校验
npx --yes ajv-cli@latest validate --spec=draft2020 -s docs/api/schemas/change-set.json -d docs/api/examples/change-set-request.json
npx --yes ajv-cli@latest validate --spec=draft2020 -s docs/api/schemas/change-draft.json -r docs/api/schemas/change-set.json -d docs/api/examples/change-draft-response.json
npx --yes ajv-cli@latest validate --spec=draft2020 -s docs/api/schemas/problem.json -r docs/api/schemas/error-code.json -d docs/api/examples/problem-revision-conflict.json
```

## 8. 已知差异与待确认

- **已裁定（2026-10-04）**：开发方案附录 A 实际列出 **10 个**稳定错误码；此前"11 个"为误述，
  总指挥已采纳本契约结论。本契约以附录 A 为准，未新增未记录的 code（见 `schemas/error-code.json` 的 `$comment`）。
- `schemas/model-bundle.ref.json` 仅为引用占位。若未来需要一份可 `$ref` 的 JSON Schema，
  应由 `packages/contracts` 从 `modelBundleSchema` 生成，禁止手工维护副本。
