import { useEffect, useRef, useState, type JSX } from 'react';
import type { SceneProjection } from '../projection/scene-projection.schema';
import {
  resolveRenderMode,
  type RenderPreference,
} from '../presentation/render-mode';
import { detectWebglSupport } from '../presentation/webgl';
import { ObjectCardView } from './ObjectCardView';
import { PerfHud } from './PerfHud';
import { Scene3D } from './Scene3D';
import { Story2D } from './Story2D';
import { TextEquivalent } from './TextEquivalent';

/**
 * 呈现根组件：同一 SceneProjection 驱动 3D 导览与 2D 故事视图。
 * `webgl` 属性用于注入探测结果（测试/SSR 传 false 验证降级）；不传则由浏览器探测。
 */
export interface PresentationRootProps {
  projection: SceneProjection;
  webgl?: boolean | null;
  initialPreference?: RenderPreference;
}

export function PresentationRoot({
  projection,
  webgl = null,
  initialPreference = 'auto',
}: PresentationRootProps): JSX.Element {
  const [preference, setPreference] = useState<RenderPreference>(initialPreference);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(webgl);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const mountAt = useRef<number>(typeof performance === 'undefined' ? 0 : performance.now());

  useEffect(() => {
    if (webgl !== null) {
      setWebglSupported(webgl);
      return;
    }
    setWebglSupported(detectWebglSupport().supported);
  }, [webgl]);

  const decision = resolveRenderMode({ webglSupported, preference });
  const selectedCard =
    selectedId === null ? null : (projection.cards.find((card) => card.id === selectedId) ?? null);

  return (
    <div className="presentation">
      <header className="presentation-header">
        <h1>{projection.projectId} · 3D 导览（M0-04 Spike）</h1>
        <p className="mode-reason" data-testid="mode-reason">
          {decision.reason}
        </p>
        <div className="controls" role="group" aria-label="渲染模式切换">
          <button type="button" onClick={() => setPreference('3d')} aria-pressed={preference === '3d'}>
            3D 导览
          </button>
          <button type="button" onClick={() => setPreference('2d')} aria-pressed={preference === '2d'}>
            2D 故事（降级）
          </button>
          <button type="button" onClick={() => setPreference('auto')} aria-pressed={preference === 'auto'}>
            自动
          </button>
          <button type="button" onClick={() => setShowText((value) => !value)} aria-expanded={showText}>
            文本等价
          </button>
        </div>
      </header>

      <div className="presentation-body">
        <div className="stage">
          {decision.mode === '3d' ? (
            <Scene3D
              projection={projection}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReady={() => setLoadMs(Math.round(performance.now() - mountAt.current))}
            />
          ) : (
            <Story2D projection={projection} />
          )}
        </div>

        <aside className="inspector" aria-label="对象卡">
          {decision.mode === '3d' && <PerfHud loadMs={loadMs} />}
          <h2>对象卡</h2>
          {selectedCard ? (
            <ObjectCardView card={selectedCard} />
          ) : (
            <p className="hint">
              在 3D 场景中点击区域、角色、站点、问题或交付物查看通俗说明；2D 视图下方已列出全部对象卡。
            </p>
          )}
        </aside>
      </div>

      {showText && <TextEquivalent projection={projection} />}
    </div>
  );
}
