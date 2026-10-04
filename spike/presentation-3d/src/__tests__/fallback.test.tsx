import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PresentationRoot } from '../components/PresentationRoot';
import { Story2D } from '../components/Story2D';
import { loadDemoTradeBundle } from '../presentation/load-fixture';
import { resolveRenderMode } from '../presentation/render-mode';
import { buildTextEquivalent } from '../presentation/text-equivalent';
import { detectWebglSupport } from '../presentation/webgl';
import { projectScene } from '../projection/project-scene';

const projection = projectScene(loadDemoTradeBundle());

describe('渲染模式决策', () => {
  it('WebGL 不可用 → 自动进入 2D', () => {
    expect(resolveRenderMode({ webglSupported: false, preference: 'auto' })).toMatchObject({
      mode: '2d',
    });
  });

  it('WebGL 不可用时即使强选 3D 也降级', () => {
    expect(resolveRenderMode({ webglSupported: false, preference: '3d' }).mode).toBe('2d');
  });

  it('探测未完成 → 先以 2D 承载', () => {
    expect(resolveRenderMode({ webglSupported: null, preference: 'auto' }).mode).toBe('2d');
  });

  it('WebGL 可用 → 3D', () => {
    expect(resolveRenderMode({ webglSupported: true, preference: 'auto' }).mode).toBe('3d');
  });

  it('用户手动切 2D 优先于自动', () => {
    expect(resolveRenderMode({ webglSupported: true, preference: '2d' }).mode).toBe('2d');
  });
});

describe('WebGL 探测', () => {
  it('无 document（非浏览器）→ 不支持', () => {
    expect(detectWebglSupport(undefined)).toMatchObject({ supported: false });
  });

  it('getContext 返回 null（模拟禁用 WebGL）→ 不支持', () => {
    const stub = {
      createElement: () => ({ getContext: () => null }),
    } as unknown as Document;
    const probe = detectWebglSupport(stub);
    expect(probe.supported).toBe(false);
    expect(probe.reason).toContain('WebGL');
  });
});

describe('2D 降级内容不丢失（同一 SceneProjection）', () => {
  it('PresentationRoot 在 webgl=false 时渲染 2D 故事视图', () => {
    const html = renderToStaticMarkup(<PresentationRoot projection={projection} webgl={false} />);
    expect(html).toContain('2D 故事视图');
    expect(html).not.toContain('3D 导览画布');
  });

  it('保留全部步骤标题与旁白', () => {
    const html = renderToStaticMarkup(<Story2D projection={projection} />);
    for (const step of projection.steps) {
      expect(html).toContain(step.title);
      expect(html).toContain(step.narration);
    }
  });

  it('保留全部对象卡说明', () => {
    const html = renderToStaticMarkup(<Story2D projection={projection} />);
    for (const card of projection.cards) {
      expect(html).toContain(card.summary);
    }
  });
});

describe('3D 不承载独占信息（文本等价完整）', () => {
  it('文本等价覆盖全部实体与步骤', () => {
    const sections = buildTextEquivalent(projection);
    const byId = new Map(sections.map((section) => [section.id, section]));
    expect(byId.get('regions')?.lines).toHaveLength(projection.regions.length);
    expect(byId.get('actors')?.lines).toHaveLength(projection.actors.length);
    expect(byId.get('stations')?.lines).toHaveLength(projection.stations.length);
    expect(byId.get('paths')?.lines).toHaveLength(projection.paths.length);
    expect(byId.get('issues')?.lines).toHaveLength(projection.issues.length);
    expect(byId.get('artifacts')?.lines).toHaveLength(projection.artifacts.length);
    expect(byId.get('steps')?.lines).toHaveLength(projection.steps.length);

    const text = sections.flatMap((section) => section.lines).join('\n');
    for (const station of projection.stations) expect(text).toContain(station.code);
    for (const actor of projection.actors) expect(text).toContain(actor.label);
    for (const issue of projection.issues) expect(text).toContain(issue.label);
    for (const artifact of projection.artifacts) expect(text).toContain(artifact.label);
  });
});
