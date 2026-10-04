/**
 * 生成流水线：快照 → Document IR → DOCX。
 *
 * 这是「一条命令生成」的实现，也是确定性验证复用的核心函数。
 * 流水线本身不做 PDF（PDF 由隔离 Worker 负责，见 `soffice.ts`）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { serializeDocumentIr, summarizeDocumentIr, type DocumentIr } from './document-ir';
import { buildCurrentStateReportIr, TEMPLATE_VERSION } from './model-to-ir';
import { renderDocumentIrToBuffer } from './render-docx';
import {
  assertSnapshotUnchanged,
  loadDemoTradeSnapshot,
  sha256Buffer,
  sha256File,
  sha256Text,
} from './snapshot';

export interface GenerateReportOptions {
  /** 输出 docx 绝对路径。 */
  outFile: string;
  /** 生成时间（ISO 8601）。固定该值即可复现确定性产物。 */
  generatedAt: string;
  /** 可选：把 Document IR 序列化为 JSON 写出，便于审查格式与内容解耦。 */
  irFile?: string;
  /** 模板版本，默认取冻结的 TEMPLATE_VERSION。 */
  templateVersion?: string;
}

export interface GenerateReportResult {
  outFile: string;
  irFile?: string;
  bytes: number;
  /** DOCX 原始字节 sha256。 */
  docxSha256: string;
  /** Document IR 序列化 JSON 的 sha256。 */
  irSha256: string;
  /** 源 bundle 字节 sha256（快照标识）。 */
  snapshotSha256: string;
  /** 源 bundle 绝对路径。 */
  snapshotPath: string;
  generatedAt: string;
  templateVersion: string;
  summary: ReturnType<typeof summarizeDocumentIr>;
  ir: DocumentIr;
}

/** 构建 IR 并渲染 DOCX 落盘；生成前后校验源 bundle 哈希不变。 */
export async function generateReport(options: GenerateReportOptions): Promise<GenerateReportResult> {
  const templateVersion = options.templateVersion ?? TEMPLATE_VERSION;
  const snapshot = loadDemoTradeSnapshot();
  const before = snapshot.sha256;

  const ir = buildCurrentStateReportIr(snapshot.bundle, before, {
    generatedAt: options.generatedAt,
    templateVersion,
  });
  const irJson = serializeDocumentIr(ir);
  const buffer = await renderDocumentIrToBuffer(ir);

  mkdirSync(path.dirname(options.outFile), { recursive: true });
  writeFileSync(options.outFile, buffer);
  if (options.irFile) {
    mkdirSync(path.dirname(options.irFile), { recursive: true });
    writeFileSync(options.irFile, irJson, 'utf8');
  }

  assertSnapshotUnchanged(snapshot);
  const after = sha256File(snapshot.absolutePath);
  if (after !== before) {
    throw new Error(`snapshot hash mismatch after generation: ${before} -> ${after}`);
  }

  return {
    outFile: options.outFile,
    irFile: options.irFile,
    bytes: buffer.byteLength,
    docxSha256: sha256Buffer(buffer),
    irSha256: sha256Text(irJson),
    snapshotSha256: before,
    snapshotPath: snapshot.absolutePath,
    generatedAt: options.generatedAt,
    templateVersion,
    summary: summarizeDocumentIr(ir),
    ir,
  };
}
