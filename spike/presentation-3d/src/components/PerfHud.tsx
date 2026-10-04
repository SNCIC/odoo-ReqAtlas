import { useEffect, useState, type JSX } from 'react';

/**
 * 运行时性能 HUD：真实测量 FPS 与 JS 堆内存，不在代码中写死任何数字。
 * 浏览器侧数值必须在目标设备上人工观测后填入 PERF.md。
 */

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

export interface PerfHudProps {
  /** 3D 首帧就绪耗时（毫秒）；未知时为 null。 */
  loadMs: number | null;
}

export function PerfHud({ loadMs }: PerfHudProps): JSX.Element {
  const [fps, setFps] = useState<number | null>(null);
  const [heapMb, setHeapMb] = useState<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let handle = 0;
    const loop = (): void => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
        const memory = (performance as PerformanceWithMemory).memory;
        setHeapMb(memory ? Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10 : null);
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <dl className="perf-hud" data-testid="perf-hud">
      <dt>3D 首帧</dt>
      <dd>{loadMs === null ? '待测' : `${loadMs} ms`}</dd>
      <dt>帧率</dt>
      <dd>{fps === null ? '待测' : `${fps} fps`}</dd>
      <dt>JS 堆</dt>
      <dd>{heapMb === null ? '不可用（浏览器未暴露）' : `${heapMb} MB`}</dd>
    </dl>
  );
}
