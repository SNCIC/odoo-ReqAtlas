/**
 * 确定性验证 + 回链（反向）校验。
 *
 * 1. 固定 generatedAt，对同一快照连续生成两次 DOCX；
 * 2. 比较原始字节 sha256 与「解包后 word/document.xml 内容哈希」（python 实现，避免自证）；
 * 3. 解包 DOCX 提取全部文本，断言 bundle 中每个对象 code 都出现（反向校验）。
 *
 * 用法：pnpm --filter @reqatlas/spike-document verify
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemoTradeSnapshot } from '../src/snapshot';
import { generateReport } from '../src/pipeline';

/** 固定生成时间：确定性验证的可复现锚点（类似 SOURCE_DATE_EPOCH）。 */
const FIXED_GENERATED_AT = '2026-10-04T00:00:00.000Z';

const packageRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const outDir = path.join(packageRoot, 'out', 'verify');
const scriptsDir = path.join(packageRoot, 'scripts');

function fail(message: string): never {
  console.error(`[verify] FAILED: ${message}`);
  process.exit(1);
}

function pyBin(): string {
  const candidates = ['python', 'py'];
  for (const c of candidates) {
    const res = spawnSync(c, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (res.status === 0) return c;
  }
  fail('python 不可用，无法执行反向校验');
}

function runPython(script: string, args: string[]): string {
  const res = spawnSync(pyBin(), [path.join(scriptsDir, script), ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  process.stdout.write(res.stdout ?? '');
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    fail(`${script} 退出码=${res.status}`);
  }
  return res.stdout ?? '';
}

async function main(): Promise<void> {
  const snapshot = loadDemoTradeSnapshot();
  const bundlePath = snapshot.absolutePath;
  const totalCodes = snapshot.bundle.modelObject.length;
  console.log(`[verify] 快照=${snapshot.relativePath} sha256=${snapshot.sha256} bytes=${snapshot.bytes}`);

  const a = path.join(outDir, 'report-a.docx');
  const b = path.join(outDir, 'report-b.docx');

  console.log('[verify] 连续生成两次（固定 generatedAt）...');
  const first = await generateReport({ outFile: a, generatedAt: FIXED_GENERATED_AT });
  const second = await generateReport({ outFile: b, generatedAt: FIXED_GENERATED_AT });

  console.log('[verify] 原始字节 sha256：');
  console.log(`  report-a.docx = ${first.docxSha256}  (${first.bytes} bytes)`);
  console.log(`  report-b.docx = ${second.docxSha256}  (${second.bytes} bytes)`);
  console.log(`  raw_bytes_identical = ${first.docxSha256 === second.docxSha256}`);
  console.log(`  ir_sha256_identical = ${first.irSha256 === second.irSha256}`);

  console.log('[verify] 解包后 word/document.xml 内容比对（python zipfile）：');
  runPython('compare_docx_content.py', [a, b]);

  console.log(`[verify] 反向校验：断言 ${totalCodes} 个对象 code 全部出现在 DOCX 文本中`);
  runPython('traceability_check.py', ['--bundle', bundlePath, '--docx', a]);

  if (first.docxSha256 !== second.docxSha256) {
    console.log(
      '[verify] 注意：原始 DOCX 字节不一致（zip 容器时间戳导致），以 document.xml 内容哈希为准。',
    );
  }
  console.log('[verify] DONE');
}

main().catch((err: unknown) => {
  console.error('[verify] FAILED:', err);
  process.exitCode = 1;
});
