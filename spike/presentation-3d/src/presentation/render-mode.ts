/**
 * 渲染模式决策（ADR-004 决策第 4 条 / 实施方案 §7.5）。
 *
 * 规则：3D 不可用时**自动**降级为 2D；也可由用户**手动**切换；
 * 探测未完成时先以 2D 承载，避免空白/崩溃。
 */

export type RenderMode = '3d' | '2d';
export type RenderPreference = 'auto' | '3d' | '2d';

export interface RenderModeInput {
  /** null = 尚未完成 WebGL 探测。 */
  webglSupported: boolean | null;
  preference: RenderPreference;
}

export interface RenderModeDecision {
  mode: RenderMode;
  reason: string;
}

export function resolveRenderMode(input: RenderModeInput): RenderModeDecision {
  if (input.preference === '2d') {
    return { mode: '2d', reason: '用户手动切换到 2D 故事视图。' };
  }
  if (input.webglSupported === false) {
    return {
      mode: '2d',
      reason: '检测到 WebGL 不可用，自动降级为 2D 故事视图（步骤、旁白、对象卡保持不变）。',
    };
  }
  if (input.webglSupported === null) {
    return { mode: '2d', reason: 'WebGL 探测未完成，先以 2D 承载，探测成功后自动进入 3D 导览。' };
  }
  if (input.preference === '3d') {
    return { mode: '3d', reason: '用户手动切换到 3D 导览，且 WebGL 可用。' };
  }
  return { mode: '3d', reason: 'WebGL 可用，使用 3D 导览。' };
}
