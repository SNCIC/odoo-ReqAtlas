# infra/compose —— 【未经验证】

> **本机没有 Docker。** 产品负责人明确 M0/M1 阶段"先不用 Docker"。
>
> 本目录下的 `docker-compose.yml` 是为 M1-02 准备的**后续骨架**，
> **从未在真实容器环境中运行验证过**，当前**不作为任何验证步骤的前置条件**，
> 也不被 `pnpm ci` / CI 引用。所有置信度限制见
> [`docs/engineering/README.md`](../../docs/engineering/README.md) 的「已知偏差」一节。

## 内容

`docker-compose.yml` 定义了以下依赖服务（均带 `healthcheck`）：

| 服务       | 镜像                             | 端口        | 用途                               |
| ---------- | -------------------------------- | ----------- | ---------------------------------- |
| `postgres` | `pgvector/pgvector:pg16`         | 5432        | PostgreSQL 16 + pgvector 扩展      |
| `redis`    | `redis:7-alpine`                 | 6379        | BullMQ 队列后端                    |
| `minio`    | `minio/minio:latest`             | 9000 / 9001 | S3 兼容对象存储（快照 / 文档产物） |
| `keycloak` | `quay.io/keycloak/keycloak:26.0` | 8080        | OIDC 身份提供方（尚未接入）        |
| `clamav`   | `clamav/clamav:stable`           | 3310        | 上传文件病毒扫描                   |

## 使用方法（在具备 Docker 的机器上）

```bash
# 需先准备 .env（可从仓库根目录 .env.example 复制）
docker compose -f infra/compose/docker-compose.yml up -d
docker compose -f infra/compose/docker-compose.yml ps
```

## 状态

- 状态：**未验证（unverified）**
- 原因：开发机无 Docker，不允许用容器作为验证前置
- 后续：M1-02 在具备容器环境的机器上补齐"干净环境一条命令可复现"的验收证据
