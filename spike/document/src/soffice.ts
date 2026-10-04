/**
 * LibreOffice（soffice）探测与 DOCX → PDF 转换。
 *
 * ADR-008 规定 PDF 由「隔离的 LibreOffice Worker」生成；本 Spike 只验证
 * 「本机是否有 soffice + 能否转出中文 PDF」，不实现容器隔离。
 * 若探测不到 soffice，一律如实标注 PDF「未验证/受阻」，绝不伪造产物。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WINDOWS_CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

export type SofficeSource = 'env' | 'windows-default' | 'path' | 'none';

export interface SofficeDetection {
  found: boolean;
  path: string | null;
  source: SofficeSource;
  /** 版本字符串（best-effort；Windows GUI 版可能不回显，则为 null）。 */
  version: string | null;
  /** 探测过程的可读说明，便于报告引用。 */
  detail: string;
}

function tryVersion(binPath: string): string | null {
  const res = spawnSync(binPath, ['--version'], {
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  return out.length > 0 ? out.split(/\r?\n/)[0]! : null;
}

/** 探测本机 soffice：环境变量 → Windows 默认安装路径 → PATH。 */
export function detectSoffice(): SofficeDetection {
  const envPath = process.env.SOFFICE_PATH;
  if (envPath && existsSync(envPath)) {
    return {
      found: true,
      path: envPath,
      source: 'env',
      version: tryVersion(envPath),
      detail: `SOFFICE_PATH=${envPath}`,
    };
  }

  for (const candidate of WINDOWS_CANDIDATES) {
    if (existsSync(candidate)) {
      return {
        found: true,
        path: candidate,
        source: 'windows-default',
        version: tryVersion(candidate),
        detail: `found at ${candidate}`,
      };
    }
  }

  const locator = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(locator, ['soffice'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  const first = `${res.stdout ?? ''}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (res.status === 0 && first) {
    return {
      found: true,
      path: first,
      source: 'path',
      version: tryVersion(first),
      detail: `${locator} soffice -> ${first}`,
    };
  }

  return {
    found: false,
    path: null,
    source: 'none',
    version: null,
    detail: 'soffice not found in SOFFICE_PATH, Windows default install dirs, or PATH',
  };
}

export interface PdfConversionResult {
  ok: boolean;
  pdfPath: string | null;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

/**
 * 用 soffice 将 DOCX 转 PDF。
 *
 * 使用独立的 `-env:UserInstallation` profile，避免与用户正在运行的 LibreOffice
 * 实例争抢锁；`--headless --norestore` 保证无 GUI 交互。
 */
export function convertDocxToPdf(
  docxPath: string,
  outDir: string,
  sofficePath: string,
  timeoutMs = 180000,
): PdfConversionResult {
  mkdirSync(outDir, { recursive: true });
  // 独立的临时 profile，避免与用户正在运行的 LibreOffice 实例争抢锁，
  // 也避免把 LibreOffice 内部文件写进 out/。
  const profileDir = mkdtempSync(path.join(tmpdir(), 'reqatlas-lo-'));
  const profileUrl = pathToFileURL(profileDir).href;

  const args = [
    `-env:UserInstallation=${profileUrl}`,
    '--headless',
    '--norestore',
    '--convert-to',
    'pdf',
    '--outdir',
    outDir,
    docxPath,
  ];
  const res = spawnSync(sofficePath, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });

  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    // best-effort：profile 位于系统临时目录，清理失败不影响结果
  }

  const expected = path.join(outDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
  const ok = res.status === 0 && existsSync(expected);
  return {
    ok,
    pdfPath: ok ? expected : null,
    command: `${sofficePath} ${args.join(' ')}`,
    exitCode: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error ? String(res.error.message) : null,
  };
}
