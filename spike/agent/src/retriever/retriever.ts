import type { ModelBundle, ModelObject, ObjectKind } from '@reqatlas/testkit';

/**
 * 对象复用检索器（本 Spike 的核心价值）。
 *
 * 在冻结 ModelBundle 上按「名称 / 编号 / 术语」做确定性检索；Agent 生成草案时必须先经此检索，
 * 命中已存在对象时**引用其稳定 ID**，而不是 `create` 一个同名临时对象——这是「复用而非重复创建」
 * 的机制保证（对应 M5-04 引用 ID / M5-08 回归）。
 */

export interface RetrievalMatch {
  object: ModelObject;
  score: number;
  matchedOn: string[];
}

export interface SearchOptions {
  candidates?: readonly ModelObject[];
  limit?: number;
}

export interface Retriever {
  search(query: string, options?: SearchOptions): RetrievalMatch[];
  /** 解析单个术语到最可能的既有对象（可限定 kind）。 */
  resolve(term: string, kind?: ObjectKind): ModelObject | undefined;
  /** 直接相邻对象（经 model_relation 任一端点），用于补齐最小上下文中的引用端点。 */
  neighbours(ids: readonly string[]): ModelObject[];
}

/**
 * 试点场景领域同义词（仅用于**检索打分**，不硬编码任何草案内容）。
 * 键为中文习惯说法，值为 bundle 中的稳定 code。
 */
export const DEFAULT_ALIASES: Readonly<Record<string, string>> = {
  财务: 'ROLE-003',
  销售经理: 'ROLE-002',
  销售员: 'ROLE-001',
  仓库: 'ROLE-004',
  采购: 'ROLE-005',
  客户: 'ROLE-006',
  折扣审批: 'ACT-003',
  折扣: 'DEC-001',
  信用检查: 'ACT-004',
  客户信用: 'PROB-002',
  信用不足: 'EXC-002',
  特批: 'ACT-009',
  逾期: 'DEC-002',
  报价单: 'DO-001',
  销售订单: 'DO-002',
  发票: 'DO-003',
  发货单: 'DO-004',
  回款: 'ACT-008',
  开票: 'ACT-007',
  发货: 'ACT-006',
  下单: 'ACT-005',
};

function scoreObject(
  object: ModelObject,
  query: string,
  aliases: Readonly<Record<string, string>>,
): { score: number; matchedOn: string[] } {
  const matchedOn: string[] = [];
  let score = 0;
  const q = query.toLowerCase();

  if (object.title.length > 0 && q.includes(object.title.toLowerCase())) {
    score += 6;
    matchedOn.push('title');
  }
  if (q.includes(object.code.toLowerCase())) {
    score += 6;
    matchedOn.push('code');
  }
  for (const [alias, code] of Object.entries(aliases)) {
    if (code === object.code && q.includes(alias.toLowerCase())) {
      score += 8;
      matchedOn.push(`alias:${alias}`);
    }
  }
  return { score, matchedOn };
}

export function createRetriever(
  bundle: ModelBundle,
  aliases: Readonly<Record<string, string>> = DEFAULT_ALIASES,
): Retriever {
  const byId = new Map<string, ModelObject>();
  for (const o of bundle.modelObject) byId.set(o.id, o);

  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const r of bundle.modelRelation) {
    link(r.fromId, r.toId);
    link(r.toId, r.fromId);
  }

  const search = (query: string, options?: SearchOptions): RetrievalMatch[] => {
    const pool = options?.candidates ?? bundle.modelObject;
    const matches: RetrievalMatch[] = [];
    for (const object of pool) {
      const { score, matchedOn } = scoreObject(object, query, aliases);
      if (score > 0) matches.push({ object, score, matchedOn });
    }
    matches.sort((a, b) => b.score - a.score || a.object.code.localeCompare(b.object.code));
    return options?.limit !== undefined ? matches.slice(0, options.limit) : matches;
  };

  const resolve = (term: string, kind?: ObjectKind): ModelObject | undefined => {
    const aliasCode = aliases[term];
    if (aliasCode !== undefined) {
      const obj = byId.get(aliasCode);
      if (obj && (kind === undefined || obj.kind === kind)) return obj;
    }
    const top = search(term, { limit: 5 }).find(
      (m) => kind === undefined || m.object.kind === kind,
    );
    return top?.object;
  };

  const neighbours = (ids: readonly string[]): ModelObject[] => {
    const seen = new Set(ids);
    const out: ModelObject[] = [];
    for (const id of ids) {
      for (const nid of adjacency.get(id) ?? []) {
        if (seen.has(nid)) continue;
        seen.add(nid);
        const obj = byId.get(nid);
        if (obj) out.push(obj);
      }
    }
    return out;
  };

  return { search, resolve, neighbours };
}
