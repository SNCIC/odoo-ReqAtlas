import type { JSX } from 'react';
import type { SceneProjection } from '../projection/scene-projection.schema';
import { buildTextEquivalent } from '../presentation/text-equivalent';

/** 文本等价表达：与 3D 内容一一对应的列表视图。 */
export function TextEquivalent({ projection }: { projection: SceneProjection }): JSX.Element {
  const sections = buildTextEquivalent(projection);

  return (
    <section className="text-equivalent" aria-label="文本等价表达">
      <h2>文本等价（3D 不承载独占信息）</h2>
      <p>以下列表与 3D 导览一一对应；不开启 WebGL 也能获取全部信息。</p>
      {sections.map((section) => (
        <details key={section.id} open data-section-id={section.id}>
          <summary>{section.title}</summary>
          <ul>
            {section.lines.map((line, index) => (
              <li key={`${section.id}-${index}`}>{line}</li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
