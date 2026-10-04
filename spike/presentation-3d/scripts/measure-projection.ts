import { performance } from 'node:perf_hooks';
import { projectScene } from '../src/projection/project-scene';
import { loadDemoTradeBundle } from '../src/presentation/load-fixture';

/**
 * Node 侧投影耗时实测（可自动化部分）。
 * 浏览器侧（3D 载入 / FPS / 内存）无法在无浏览器环境自动测量，见 PERF.md。
 */

const ITERATIONS = 500;
const WARMUP = 50;

const bundle = loadDemoTradeBundle();
for (let i = 0; i < WARMUP; i += 1) projectScene(bundle);

const samples: number[] = [];
for (let i = 0; i < ITERATIONS; i += 1) {
  const start = performance.now();
  projectScene(bundle);
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);

const pick = (quantile: number): number =>
  samples[Math.min(samples.length - 1, Math.floor(quantile * samples.length))] ?? 0;
const round4 = (value: number): number => Math.round(value * 10000) / 10000;

const projection = projectScene(bundle);
console.log(
  JSON.stringify(
    {
      iterations: ITERATIONS,
      minMs: round4(samples[0] ?? 0),
      medianMs: round4(pick(0.5)),
      p95Ms: round4(pick(0.95)),
      maxMs: round4(samples[samples.length - 1] ?? 0),
      projectionBytes: Buffer.byteLength(JSON.stringify(projection), 'utf8'),
    },
    null,
    2,
  ),
);
