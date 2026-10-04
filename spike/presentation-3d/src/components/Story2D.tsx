import type { JSX } from 'react';
import type { SceneProjection } from '../projection/scene-projection.schema';
import { ObjectCardView } from './ObjectCardView';

/**
 * 2D 故事视图：3D 不可用时的降级承载。
 * 与 3D 消费**同一个** SceneProjection，因此步骤、旁白、对象卡完全一致。
 */
export function Story2D({ projection }: { projection: SceneProjection }): JSX.Element {
  return (
    <section className="story-2d" aria-label="2D 故事视图">
      <h2>2D 故事视图</h2>
      <p className="story-note">
        当前以 2D 承载（WebGL 不可用或手动切换）。内容与 3D 导览一致：同一份步骤、旁白与对象卡。
      </p>
      <ol className="story-steps">
        {projection.steps.map((step) => (
          <li key={step.id} data-step-id={step.id} data-focus-id={step.focusId}>
            <h3>{step.title}</h3>
            <p>{step.narration}</p>
          </li>
        ))}
      </ol>
      <h3>对象卡（{projection.cards.length}）</h3>
      <div className="object-card-grid">
        {projection.cards.map((card) => (
          <ObjectCardView key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
