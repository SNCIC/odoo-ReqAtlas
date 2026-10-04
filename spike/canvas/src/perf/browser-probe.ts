/**
 * 浏览器侧性能探针（真实数字，非编造）。
 *
 * - 帧率：`requestAnimationFrame` 逐帧打点，输出帧间隔 P50/P95 与 FPS。
 * - 长任务：`PerformanceObserver('longtask')` 统计 >50ms 的任务。
 * - 内存：`performance.memory`（仅 Chromium 提供，缺失时为 null）。
 *
 * 诚实声明：`pan-zoom` 模式通过每帧 `setViewport` 振荡模拟拖拽/缩放的渲染压力，
 * 属于**合成**压力而非真实人类输入；报告中标注 mode 以便区分。
 */

/**
 * - `idle`：只渲染，无交互压力。
 * - `pan`：仅平移（保持 zoom=1），对应「只改变换矩阵」的廉价路径。
 * - `pan-zoom`：平移 + 缩放振荡，对应需要重新栅格化的昂贵路径。
 */
export type PerfMode = 'idle' | 'pan' | 'pan-zoom';

export type FrameSummary = {
  sampleCount: number;
  durationMs: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsMax: number;
  fpsMean: number;
  fpsP05: number;
};

export type LongTaskSummary = {
  supported: boolean;
  count: number;
  totalMs: number;
  maxMs: number;
};

export type MemorySummary = {
  usedMb: number;
  totalMb: number;
  limitMb: number;
} | null;

export type BrowserPerfReport = {
  mode: PerfMode;
  scaleFactor: number;
  nodeCount: number;
  edgeCount: number;
  frames: FrameSummary;
  longTasks: LongTaskSummary;
  memoryBefore: MemorySummary;
  memoryAfter: MemorySummary;
  userAgent: string;
  hardwareConcurrency: number;
  startedAt: string;
  notes: string;
};

type ChromiumPerformance = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
};

function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[idx];
}

export function readMemory(): MemorySummary {
  const perf = performance as ChromiumPerformance;
  const mem = perf.memory;
  if (!mem) return null;
  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  return {
    usedMb: mb(mem.usedJSHeapSize),
    totalMb: mb(mem.totalJSHeapSize),
    limitMb: mb(mem.jsHeapSizeLimit),
  };
}

/** 逐帧采集帧间隔；可选 `drive` 在每帧渲染前执行（用于合成压力）。 */
export function measureFrames(options: {
  durationMs: number;
  drive?: (elapsedMs: number) => void;
}): Promise<FrameSummary> {
  const { durationMs, drive } = options;
  return new Promise<FrameSummary>((resolve) => {
    const intervals: number[] = [];
    let last = performance.now();
    const start = last;
    const tick = (ts: number): void => {
      const elapsed = ts - start;
      if (drive) drive(elapsed);
      if (intervals.length > 0 || elapsed > 0) intervals.push(ts - last);
      last = ts;
      if (elapsed < durationMs) {
        requestAnimationFrame(tick);
      } else {
        // 丢弃首帧（包含启动开销）。
        const samples = intervals.slice(1).sort((a, b) => a - b);
        const total = samples.reduce((s, v) => s + v, 0);
        const meanMs = samples.length > 0 ? total / samples.length : 0;
        const p50 = percentile(samples, 50);
        const p95 = percentile(samples, 95);
        resolve({
          sampleCount: samples.length,
          durationMs: Math.round(elapsed),
          frameMsP50: Math.round(p50 * 100) / 100,
          frameMsP95: Math.round(p95 * 100) / 100,
          frameMsMax: Math.round((samples[samples.length - 1] ?? 0) * 100) / 100,
          fpsMean: meanMs > 0 ? Math.round((1000 / meanMs) * 10) / 10 : 0,
          // 最差 5% 帧对应的 FPS
          fpsP05: p95 > 0 ? Math.round((1000 / p95) * 10) / 10 : 0,
        });
      }
    };
    requestAnimationFrame(tick);
  });
}

/** 观察 long task（>50ms）。不支持的环境返回 supported=false。 */
export function observeLongTasks(): { stop: () => LongTaskSummary } {
  const durations: number[] = [];
  let supported = false;
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: true });
    supported = true;
  } catch {
    supported = false;
  }
  return {
    stop: () => {
      observer?.disconnect();
      const totalMs = durations.reduce((s, v) => s + v, 0);
      return {
        supported,
        count: durations.length,
        totalMs: Math.round(totalMs * 100) / 100,
        maxMs: Math.round((durations.length > 0 ? Math.max(...durations) : 0) * 100) / 100,
      };
    },
  };
}

export async function runBrowserPerf(options: {
  mode: PerfMode;
  durationMs: number;
  scaleFactor: number;
  nodeCount: number;
  edgeCount: number;
  drive?: (elapsedMs: number) => void;
}): Promise<BrowserPerfReport> {
  const memoryBefore = readMemory();
  const longTaskObserver = observeLongTasks();
  const frames = await measureFrames({ durationMs: options.durationMs, drive: options.drive });
  const longTasks = longTaskObserver.stop();
  const memoryAfter = readMemory();

  return {
    mode: options.mode,
    scaleFactor: options.scaleFactor,
    nodeCount: options.nodeCount,
    edgeCount: options.edgeCount,
    frames,
    longTasks,
    memoryBefore,
    memoryAfter,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    startedAt: new Date().toISOString(),
    notes:
      options.mode === 'pan-zoom'
        ? '合成平移+缩放：每帧 setViewport 同时振荡 x/y 与 zoom（会触发重新栅格化），非真实人类输入。'
        : options.mode === 'pan'
          ? '合成平移：每帧 setViewport 仅振荡 x/y（zoom 固定为 1），非真实人类输入。'
          : '空转：仅渲染，无交互压力。',
  };
}
