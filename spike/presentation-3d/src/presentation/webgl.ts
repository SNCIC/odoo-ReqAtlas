/**
 * WebGL 可用性探测（ADR-004 决策第 4 条）。
 *
 * 纯函数式：允许注入 `document`，便于在 Node 环境用桩对象验证降级判定，
 * 无需真实浏览器或 Docker。
 */

export interface WebglProbe {
  supported: boolean;
  renderer: string | null;
  reason: string;
}

export function detectWebglSupport(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): WebglProbe {
  if (!doc) {
    return { supported: false, renderer: null, reason: '非浏览器环境：没有 document，降级为 2D。' };
  }
  let canvas: HTMLCanvasElement;
  try {
    canvas = doc.createElement('canvas');
  } catch {
    return { supported: false, renderer: null, reason: '无法创建 canvas，降级为 2D。' };
  }
  const context =
    canvas.getContext('webgl2') ??
    canvas.getContext('webgl') ??
    canvas.getContext('experimental-webgl');
  if (!context) {
    return { supported: false, renderer: null, reason: '无法获取 WebGL 上下文，降级为 2D。' };
  }
  const gl = context as WebGLRenderingContext;
  const version = gl.getParameter(gl.VERSION);
  return {
    supported: true,
    renderer: typeof version === 'string' ? version : null,
    reason: 'WebGL 上下文可用。',
  };
}
