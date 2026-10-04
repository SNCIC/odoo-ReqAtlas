# SSE 事件契约

实时通道用于让客户端**使查询失效**或**追加通知**，不作为业务事实的传输通道。
权威来源：实施方案 §5.1（异步）、§5.2 ⑦（实时）、§5.3；开发方案 §6.7。

## 1. 传输与端点

- 传输：Server-Sent Events（`text/event-stream`），单向服务端推送。
- 端点：`GET /api/v1/events`（`Accept: text/event-stream`）。
- 这是 §5.2 已有的实时能力，未新增业务端点。

## 2. 事件信封

每个事件使用标准 SSE 字段，`data` 为 JSON：

```
id: <eventId>
event: project.revision.created
data: {"type":"project.revision.created","occurredAt":"2026-10-04T09:12:31Z","data":{...}}

```

| 字段 | 约定 |
| --- | --- |
| `id` | 事件唯一 ID（单调、可用于去重与断线补取）。 |
| `event` | 事件名，取值为下方 6 类之一。 |
| `data.type` | 与 `event` 一致，便于客户端在 `onmessage` 统一处理。 |
| `data.occurredAt` | RFC 3339 时间戳。 |
| `data.data` | 该事件的最小 payload（见下表）。 |

## 3. 鉴权、重连与去重

- **鉴权**：SSE 连接按 §5.1 使用 OIDC Access Token（bearer）。
  令牌无效或过期返回 `401 AUTH_REQUIRED`（`application/problem+json`），客户端重新登录后重连。
- **授权范围**：连接只推送当前用户有权访问的对象/项目事件；越权上下文不得出现在 payload 中。
- **重连游标**：客户端断线后重连时携带 `Last-Event-ID: <eventId>` 请求头；
  服务端从该 ID 之后补推（受保留窗口限制，窗口外需客户端主动重取查询）。
- **事件去重**：客户端以 `id` 去重；同一 `id` 只处理一次（幂等 reducer）。
- **心跳**：服务端定期发送注释行（`:` 开头）作为 keep-alive；客户端忽略。
- **客户端行为总则**：收到事件后**只**做两件事——使相关 TanStack Query 失效，或向通知列表追加条目；
  不得据事件直接改写本地实体状态（避免与 revision 冲突）。

## 4. 事件清单

### 4.1 `project.revision.created`

- **触发时机**：ChangeSet 在单事务内应用成功、`project_revision` 递增之后。
- **最小 payload**：

```json
{ "projectId": "prj_123", "revision": 42, "changeSetId": "cs_9c1" }
```

- **客户端应有行为**：使该项目的模型/项目/变更集查询失效，重新按新 revision 拉取。

### 4.2 `agent.run.updated`

- **触发时机**：AgentRun 状态变化（进入 running、需要追问、产出草案、成功/失败/取消）。
- **最小 payload**：

```json
{ "runId": "run_77", "status": "needs_input", "draftId": null }
```

- **客户端应有行为**：失效 `GET /agent-runs/{id}` 查询；`status=succeeded` 且含 `draftId` 时，
  失效 `GET /change-drafts/{id}` 并提示可审阅草案。

### 4.3 `document.job.updated`

- **触发时机**：文档任务章节进度推进或完成/失败。
- **最小 payload**：

```json
{ "jobId": "job_doc_5", "status": "rendering", "progress": 0.6 }
```

- **客户端应有行为**：更新文档中心任务进度；完成时失效产物列表查询，失败时在任务上标注可重试。

### 4.4 `file.updated`

- **触发时机**：上传文件扫描/解析状态变为 `ready`、`quarantined` 或 `failed`。
- **最小 payload**：

```json
{ "fileId": "file_31", "status": "ready" }
```

- **客户端应有行为**：失效该文件的查询；`quarantined`/`failed` 时追加告警通知。

### 4.5 `review.updated`

- **触发时机**：评论、确认、决议、批准等发生变更。
- **最小 payload**：

```json
{ "resourceId": "obj_12", "reviewType": "confirmation" }
```

- **客户端应有行为**：失效评审中心对应标签页查询；追加一条评审通知。

### 4.6 `notification.created`

- **触发时机**：为用户生成待办（待确认、被指派问题、需处理阻断项等）。
- **最小 payload**：

```json
{ "notificationId": "ntf_88", "category": "confirmation" }
```

- **客户端应有行为**：向通知中心追加条目并更新未读计数；点击后跳到关联对象。

## 5. 与 `202 + jobId` 的配合

异步命令（`POST /projects/{id}/agent-runs`、`POST /snapshots`）返回 `202` 与 `jobId`
仅表示"已受理"。客户端不轮询猜测结果，而是等待对应 `agent.run.updated` /
`document.job.updated` 事件；断线期间依赖 `Last-Event-ID` 补取或主动重取任务查询。
