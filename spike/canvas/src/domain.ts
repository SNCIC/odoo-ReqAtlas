/**
 * 领域契约的唯一来源：**类型全部从 `@reqatlas/testkit` 转发**。
 *
 * 本文件不定义、不复制任何类型；testkit 的 zod Schema / 类型一旦变化，
 * 本包会立即拿到编译错误，而不是静默跑偏。
 *
 * 运行时 zod Schema 的引入见 `./schema.ts`（原因：testkit 的**包入口**聚合了
 * 依赖 `node:fs/node:path/node:url` 的 fixture 加载器，无法进入浏览器构建）。
 */
export type {
  ModelBundle,
  ModelObject,
  ModelRelation,
  View,
  ViewLayout,
  Evidence,
  EvidenceLink,
  ObjectKind,
  ObjectState,
  SourceStatus,
  RelationKind,
} from '@reqatlas/testkit';
