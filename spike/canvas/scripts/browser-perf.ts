/**
 * 浏览器性能自动采集（可选）：用 Playwright 打开构建产物，自动跑一次画布压力测试。
 *
 * 前置：
 *   1) pnpm --filter @reqatlas/spike-canvas build
 *   2) pnpm --filter @reqatlas/spike-canvas exec playwright install chromium
 * 运行：
 *   pnpm --filter @reqatlas/spike-canvas perf:browser
 *
 * 可通过环境变量覆盖：BENCH_SCALE(默认1)、BENCH_MODE(idle|pan|pan-zoom)、BENCH_DURATION(ms)、BENCH_PORT。
 *
 * 页面通过 `?bench=1` 自动执行，并通过 `window.__canvasPerfReport` 回传结果
 * （见 src/perf/browser-probe.ts 与 App.tsx 的自动化入口）。
 *
 * 产物形状（`BENCH_OUT`）：`{ metadata, payload }`
 * —— `metadata` 记录"基于哪份基线"（重算的源 bundle sha256），
 * `payload` 记录"浏览器测到了什么"（探针报告）。二者结构分离，便于独立校验。
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import type { BrowserPerfReport } from '../src/perf/browser-probe';
import { FROZEN_SOURCE_BUNDLE_SHA256, resolveFrozenSourceBundle } from './source-bundle';

type BenchWindow = Window & {
  __canvasPerfDone?: boolean;
  __canvasPerfReport?: BrowserPerfReport;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.BENCH_PORT ?? 5199);
const scale = process.env.BENCH_SCALE ?? '1';
const mode = process.env.BENCH_MODE ?? 'pan-zoom';
const duration = process.env.BENCH_DURATION ?? '5000';

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('未找到 dist/index.html，请先运行：pnpm --filter @reqatlas/spike-canvas build');
  process.exit(2);
}

// 先重算并校验源基线；不一致立即抛错，避免白跑一次浏览器。
const source = resolveFrozenSourceBundle();
console.log(`源 bundle sha256 = ${source.sha256}  (重算校验通过 = 冻结锚点)`);
console.log(`源文件: ${source.fixturePath}`);

const server = await preview({ root, preview: { port: PORT, strictPort: true } });
const url = `http://localhost:${PORT}/?bench=1&scale=${scale}&mode=${mode}&duration=${duration}`;

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[page error]', msg.text());
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as BenchWindow).__canvasPerfDone === true, null, {
    timeout: 90_000,
  });
  const report = await page.evaluate(() => (window as BenchWindow).__canvasPerfReport);

  // 分层：metadata = 本次测量基于哪份基线；payload = 浏览器实际测到了什么。
  const envelope = {
    metadata: {
      producer: 'spike/canvas/scripts/browser-perf.ts',
      recordedAt: new Date().toISOString(),
      sourceBundleSha256: source.sha256,
      sourceBundleFrozenAnchorSha256: FROZEN_SOURCE_BUNDLE_SHA256,
    },
    payload: report ?? null,
  };

  console.log('=== browser perf envelope ===');
  console.log(JSON.stringify(envelope, null, 2));

  const out = process.env.BENCH_OUT;
  if (out) {
    const target = path.resolve(process.cwd(), out);
    writeFileSync(target, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    console.log(`envelope written to ${out}`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise<void>((resolve) => {
    const http = server.httpServer;
    if (http) http.close(() => resolve());
    else resolve();
  });
}
