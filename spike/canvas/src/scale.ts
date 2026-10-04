/**
 * 程序化放大 fixture（**允许**的规模曲线手段；硬编码假数据不允许）。
 *
 * 规则：
 * - factor = 1 时原样返回真实 bundle（保证「同一模型驱动」）。
 * - factor = N 时把整份 bundle 复制 N 份，第 k 份（k≥1）所有 ID 追加 `#k` 后缀，
 *   关系端点、viewLayout、evidenceLink 一并改写，从而 **保持 Schema 有效性与图结构合法**
 *   （code 唯一、端点存在、不跨项目）。
 * - 第 0 份保持真实 ID，便于对照。
 */
import type {
  ModelBundle,
  Evidence,
  EvidenceLink,
  ModelObject,
  ModelRelation,
  ViewLayout,
} from './domain';

export type AmplifyOptions = {
  /** 副本总数。1 = 原始 bundle。 */
  factor: number;
  /** 每份副本在 x 方向的偏移（用于 viewLayout 平移）。 */
  columnSpan?: number;
  /** 是否在 title 追加副本序号（默认 true，便于肉眼核对非硬编码）。 */
  annotateTitles?: boolean;
};

const DEFAULT_COLUMN_SPAN = 2200;

function suffixOf(copyIndex: number, id: string): string {
  return copyIndex === 0 ? id : `${id}#${copyIndex}`;
}

export function amplifyBundle(bundle: ModelBundle, options: AmplifyOptions): ModelBundle {
  const factor = Math.max(1, Math.floor(options.factor));
  if (factor === 1) return bundle;

  const columnSpan = options.columnSpan ?? DEFAULT_COLUMN_SPAN;
  const annotateTitles = options.annotateTitles ?? true;

  const modelObject: ModelObject[] = [];
  const modelRelation: ModelRelation[] = [];
  const viewLayout: ViewLayout[] = [];
  const evidence: Evidence[] = [];
  const evidenceLink: EvidenceLink[] = [];

  for (let k = 0; k < factor; k += 1) {
    for (const o of bundle.modelObject) {
      const copy: ModelObject = {
        ...o,
        id: suffixOf(k, o.id),
        code: suffixOf(k, o.code),
      };
      if (annotateTitles && k > 0) copy.title = `${o.title} · 副本${k}`;
      modelObject.push(copy);
    }

    for (const r of bundle.modelRelation) {
      modelRelation.push({
        ...r,
        id: suffixOf(k, r.id),
        fromId: suffixOf(k, r.fromId),
        toId: suffixOf(k, r.toId),
      });
    }

    for (const l of bundle.viewLayout) {
      viewLayout.push({
        ...l,
        id: suffixOf(k, l.id),
        objectId: suffixOf(k, l.objectId),
        x: l.x + k * columnSpan,
      });
    }

    for (const e of bundle.evidence) {
      evidence.push({ ...e, id: suffixOf(k, e.id) });
    }

    for (const link of bundle.evidenceLink) {
      evidenceLink.push({
        ...link,
        id: suffixOf(k, link.id),
        evidenceId: suffixOf(k, link.evidenceId),
        objectId: suffixOf(k, link.objectId),
      });
    }
  }

  return {
    projectId: bundle.projectId,
    projectRevision: bundle.projectRevision,
    modelObject,
    modelRelation,
    view: bundle.view,
    viewLayout,
    evidence,
    evidenceLink,
  };
}

/** 便于测试断言：放大后各集合规模应恰好是原来的 factor 倍。 */
export function expectedScaleCounts(bundle: ModelBundle, factor: number) {
  return {
    objects: bundle.modelObject.length * factor,
    relations: bundle.modelRelation.length * factor,
    viewLayout: bundle.viewLayout.length * factor,
  };
}
