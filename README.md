# ReqAtlas · 需求调研工作台

需求调研工作台（ReqAtlas）的单仓（monorepo）工作区，使用 pnpm workspace 管理。

- 工程说明、目录结构、依赖规则与命令清单：见 [`docs/engineering/README.md`](docs/engineering/README.md)
- 落地实施方案：见 [`docs/需求调研工作台-具体实施方案.md`](docs/需求调研工作台-具体实施方案.md)

## 快速开始

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm arch
```

> 当前为 M0/M1 工程底座阶段。本机无 Docker，`infra/compose/` 为未验证的后续骨架。
> 已知偏差与置信度限制记录在 [`docs/engineering/README.md`](docs/engineering/README.md) 的「已知偏差」一节。
