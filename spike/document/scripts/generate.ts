/**
 * 一条命令生成《现状调研报告》DOCX（可选转 PDF）。
 *
 * 用法：
 *   pnpm --filter @reqatlas/spike-document generate
 *   pnpm --filter @reqatlas/spike-document generate -- --generated-at 2026-10-04T00:00:00.000Z --pdf
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../src/pipeline';
import { convertDocxToPdf, detectSoffice } from '../src/soffice';

interface CliArgs {
  out: string;
  ir: string;
  generatedAt: string;
  pdf: boolean;
}

const packageRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const outDir = path.join(packageRoot, 'out');

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      map.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      map.set(key, next);
      i += 1;
    } else {
      flags.add(key);
    }
  }
  return {
    out: map.get('out') ?? path.join(outDir, 'current-state-report.docx'),
    ir: map.get('ir') ?? path.join(outDir, 'current-state-report.ir.json'),
    generatedAt: map.get('generated-at') ?? new Date().toISOString(),
    pdf: flags.has('pdf'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await generateReport({
    outFile: path.resolve(args.out),
    irFile: path.resolve(args.ir),
    generatedAt: args.generatedAt,
  });

  console.log('[generate] Document IR -> DOCX 完成');
  console.log(`  out_file          = ${result.outFile}`);
  console.log(`  ir_file           = ${result.irFile}`);
  console.log(`  bytes             = ${result.bytes}`);
  console.log(`  docx_sha256       = ${result.docxSha256}`);
  console.log(`  ir_sha256         = ${result.irSha256}`);
  console.log(`  snapshot_sha256   = ${result.snapshotSha256}`);
  console.log(`  snapshot_path     = ${result.snapshotPath}`);
  console.log(`  generated_at      = ${result.generatedAt}`);
  console.log(`  template_version  = ${result.templateVersion}`);
  console.log(`  blocks            = ${result.summary.blockTotal}`);
  console.log(`  headings          = ${result.summary.headingTotal}`);
  console.log(`  tables            = ${result.summary.tableTotal}`);
  console.log(`  object_refs       = ${result.summary.objectRefTotal}`);

  if (!args.pdf) return;

  const detection = detectSoffice();
  console.log('[generate] soffice 探测：');
  console.log(`  found   = ${detection.found}`);
  console.log(`  path    = ${detection.path ?? '(none)'}`);
  console.log(`  source  = ${detection.source}`);
  console.log(`  version = ${detection.version ?? '(unavailable)'}`);
  console.log(`  detail  = ${detection.detail}`);
  if (!detection.found || !detection.path) {
    console.log('[generate] PDF 跳过：未探测到 soffice（PDF 未验证/受阻，未生成 PDF）');
    return;
  }
  const conv = convertDocxToPdf(result.outFile, outDir, detection.path);
  console.log('[generate] LibreOffice 转 PDF：');
  console.log(`  ok        = ${conv.ok}`);
  console.log(`  pdf_path  = ${conv.pdfPath ?? '(none)'}`);
  console.log(`  exit_code = ${conv.exitCode}`);
  console.log(`  stderr    = ${conv.stderr.trim() || '(empty)'}`);
}

main().catch((err: unknown) => {
  console.error('[generate] FAILED:', err);
  process.exitCode = 1;
});
