import type { JSX } from 'react';
import type { SceneCard } from '../projection/scene-projection.schema';

/** 对象卡：拾取弹卡与 2D 列表复用同一组件与同一份数据。 */
export function ObjectCardView({ card }: { card: SceneCard }): JSX.Element {
  return (
    <article className="object-card" data-object-id={card.objectId} data-card-id={card.id}>
      <h4>{card.title}</h4>
      <p className="object-card-meta">
        {card.code} · {card.kind}
      </p>
      <p>{card.summary}</p>
    </article>
  );
}
