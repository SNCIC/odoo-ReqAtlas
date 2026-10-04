/**
 * 适配层性能测量（Node 侧，无需浏览器）。
 *
 * 测量对象：`projectBundle(bundle, opts)` —— Domain(ModelBundle) → React Flow nodes/edges/lanes。
 * 其中 `layoutMs` 为适配层内部单独计时的「布局计算」耗时。
 *
 * 运行：`pnpm --filter @reqatlas/spike-canvas perf`
 * 数据源：真实 fixture（testkit Schema 校验）+ 程序化放大副本（×6 / ×15 / ×30）。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFixturePath } from '@reqatlas/testkit/fixtures';
import { projectBundle, type LayoutMode, type ProjectBundleOptions } from '../src/adapter';
import type { ModelBundle } from '../src/domain';
import { loadDemoTradeBundleNode } from '../src/load-node';
import { amplifyBundle } from '../src/scale';

/** 冻结基线锚点：仅用于**与重算值比对**；写入产物的永远是重算值。 */
const FROZEN_SOURCE_BUNDLE_SHA256 =
  '1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62';

/** 本脚本目录 → 本包根 → `perf/`（仅本脚本局部需要，不引入共享常量）。 */
const HERE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PERF_DIR = path.join(HERE_DIR, '..', 'perf');

/**
 * 重算源 bundle 的 sha256（读真实字节），并与冻结锚点比对；不一致直接抛错。
 * 产物的 `sourceBundleSha256` 使用该**重算值**，使产物能自证源自冻结基线。
 */
function assertFrozenSourceBundle(): { sha256: string; fixturePath: string } {
  const fixturePath = resolveFixturePath('demo-trade/model-bundle.json');
  const sha256 = createHash('sha256').update(readFileSync(fixturePath)).digest('hex');
  if (sha256 !== FROZEN_SOURCE_BUNDLE_SHA256) {
    throw new Error(
      `源 bundle 哈希与冻结基线不一致（fixture 可能已被改动）：\n  实际=${sha256}\n  冻结=${FROZEN_SOURCE_BUNDLE_SHA256}`,
    );
  }
  return { sha256, fixturePath };
}

type Sample = {
  n: number;
  p50: number;
  p95: number;
  mean: number;
  min: number;
  max: number;
};

function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[idx];
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function summarize(values: number[]): Sample {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  return {
    n: sorted.length,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    mean: round(sorted.length > 0 ? total / sorted.length : 0),
    min: round(sorted[0] ?? 0),
    max: round(sorted[sorted.length - 1] ?? 0),
  };
}

type CaseResult = {
  scaleFactor: number;
  layout: LayoutMode;
  nodeCount: number;
  edgeCount: number;
  laneCount: number;
  objectCount: number;
  relationCount: number;
  iterations: number;
  project: Sample;
  layoutCalc: Sample;
  edges: Sample;
};

function benchProjection(
  bundle: ModelBundle,
  options: ProjectBundleOptions,
  warmup: number,
  iterations: number,
): CaseResult {
  for (let i = 0; i < warmup; i += 1) projectBundle(bundle, options);

  const total: number[] = [];
  const layout: number[] = [];
  const edges: number[] = [];
  const probe = projectBundle(bundle, options);
  const stats = probe.stats;
  const laneCount = probe.lanes.length;

  for (let i = 0; i < iterations; i += 1) {
    const projection = projectBundle(bundle, options);
    total.push(projection.timing.totalMs);
    layout.push(projection.timing.layoutMs);
    edges.push(projection.timing.edgesMs);
  }

  return {
    scaleFactor: 0, // 由调用方填充
    layout: options.layout ?? 'view_layout',
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    laneCount,
    objectCount: stats.objectCount,
    relationCount: stats.relationCount,
    iterations,
    project: summarize(total),
    layoutCalc: summarize(layout),
    edges: summarize(edges),
  };
}

function fmt(s: Sample): string {
  return `P50=${s.p50.toFixed(3)}ms  P95=${s.p95.toFixed(3)}ms  mean=${s.mean.toFixed(3)}ms  min=${s.min.toFixed(3)}  max=${s.max.toFixed(3)}  (n=${s.n})`;
}

function main(): void {
  const source = assertFrozenSourceBundle();
  const base = loadDemoTradeBundleNode();

  const scales: { factor: number; iterations: number; warmup: number }[] = [
    { factor: 1, iterations: 400, warmup: 40 },
    { factor: 6, iterations: 200, warmup: 20 },
    { factor: 15, iterations: 100, warmup: 10 },
    { factor: 30, iterations: 60, warmup: 6 },
  ];

  const env = {
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpu: (os.cpus()[0]?.model ?? 'unknown').trim(),
    cpuCount: os.cpus().length,
    totalMemGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
  };

  const results: CaseResult[] = [];

  console.log('============================================================');
  console.log('M0-03 适配层性能测量（projectBundle: Domain → React Flow）');
  console.log('============================================================');
  console.log(
    `环境: node ${env.node} | ${env.platform} | CPU ${env.cpu} (${env.cpuCount} 核) | ${env.totalMemGb} GB`,
  );
  console.log(
    `真实 bundle: ${base.modelObject.length} 对象 / ${base.modelRelation.length} 关系 / ${base.viewLayout.length} viewLayout / ${base.view.length} view`,
  );
  console.log(`源 bundle sha256 = ${source.sha256}  (重算校验通过 = 冻结锚点)`);
  console.log(`源文件: ${source.fixturePath}`);
  console.log('');

  for (const scale of scales) {
    const bundle = amplifyBundle(base, { factor: scale.factor });
    for (const layout of ['view_layout', 'auto'] as const) {
      const result = benchProjection(bundle, { layout }, scale.warmup, scale.iterations);
      result.scaleFactor = scale.factor;
      results.push(result);
      console.log(
        `[×${scale.factor} | ${layout}] 对象=${result.objectCount} 节点=${result.nodeCount} 边=${result.edgeCount} 泳道=${result.laneCount}`,
      );
      console.log(`    投影总计 : ${fmt(result.project)}`);
      console.log(`    布局计算 : ${fmt(result.layoutCalc)}`);
      console.log(`    边构建   : ${fmt(result.edges)}`);
      console.log('');
    }
  }

  const payload = {
    sourceBundleSha256: source.sha256,
    env,
    real: {
      objects: base.modelObject.length,
      relations: base.modelRelation.length,
      viewLayout: base.viewLayout.length,
    },
    results,
  };

  console.log('--- JSON ---');
  console.log(JSON.stringify(payload, null, 2));

  const outPath = path.join(PERF_DIR, 'adapter-results.json');
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n结果已写入 perf/adapter-results.json`);
}

main();
