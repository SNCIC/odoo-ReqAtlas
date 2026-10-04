/**
 * 最小 Document IR（M0-07 Spike）。
 *
 * 定位：格式无关的文档内容树，是 ADR-008「内容与格式解耦」的核心载体。
 * - 渲染器只消费 IR，**不直接读取 ModelBundle**；
 * - 模型 → IR 的转换在 `model-to-ir.ts` 完成；
 * - IR 可序列化为 JSON，便于哈希、持久化与跨渲染路径复用。
 *
 * 节点类型（M0 最小集）：
 * - `heading`     标题（含层级与可选章节编号）
 * - `paragraph`   段落（含 note / watermark 语义角色）
 * - `table`       表格（含可选行级对象编号引用，用于回链）
 * - `objectRef`   对象引用（稳定编号 + kind + 标题，用于图文一致性回链）
 * - `pageBreak`   分页符
 */
import { z } from 'zod';

/** IR 结构版本；格式与内容解耦后，渲染器据此选择兼容策略。 */
export const DOCUMENT_IR_VERSION = '1.0' as const;

export const IR_HEADING_MAX_LEVEL = 4;

/** 标题：level 1..4；number 为章节编号（如 "2.1"），由转换器预先算好，渲染器不再推断。 */
export const headingNodeSchema = z.object({
  type: z.literal('heading'),
  level: z.number().int().min(1).max(IR_HEADING_MAX_LEVEL),
  text: z.string().min(1),
  /** 章节编号（可选）。渲染器原样拼到标题前，避免渲染器承担编号逻辑。 */
  number: z.string().min(1).optional(),
});

/** 段落的语义角色，用于渲染样式（正文 / 注释 / 水印横幅）。 */
export const paragraphRoleSchema = z.enum(['body', 'note', 'watermark']);
export type ParagraphRole = z.infer<typeof paragraphRoleSchema>;

export const paragraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  text: z.string(),
  role: paragraphRoleSchema.default('body'),
});

/**
 * 表格：`header` 为表头，`rows` 为数据行。
 * `rowRefs` 与 `rows` 一一对应，记录该行对应的对象稳定编号（回链锚点）。
 */
export const tableNodeSchema = z.object({
  type: z.literal('table'),
  caption: z.string().optional(),
  header: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
  rowRefs: z.array(z.string()).optional(),
});

/** 对象引用：稳定编号 + kind + 标题 + 可选状态与注释。 */
export const objectRefNodeSchema = z.object({
  type: z.literal('objectRef'),
  code: z.string().min(1),
  kind: z.string().min(1),
  title: z.string(),
  state: z.string().optional(),
  note: z.string().optional(),
});

export const pageBreakNodeSchema = z.object({ type: z.literal('pageBreak') });

export const documentBlockSchema = z.discriminatedUnion('type', [
  headingNodeSchema,
  paragraphNodeSchema,
  tableNodeSchema,
  objectRefNodeSchema,
  pageBreakNodeSchema,
]);

/** 文档元数据：把不可变快照、模板版本、草稿水印写进产物，便于追溯与校验。 */
export const documentMetadataSchema = z.object({
  projectId: z.string().min(1),
  projectRevision: z.number().int().nonnegative(),
  /** 源 ModelBundle 文件字节的 sha256，作为快照标识写入产物。 */
  snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** 生成时间（ISO 8601）。可显式传入以复现确定性产物（类似 SOURCE_DATE_EPOCH）。 */
  generatedAt: z.string().min(1),
  templateVersion: z.string().min(1),
  documentStatus: z.enum(['draft', 'reviewed', 'approved']),
  /** 草稿/未确认水印标识。 */
  watermark: z.string().min(1),
  /** 数据来源说明，注明取自哪份 fixture。 */
  dataSource: z.string().min(1),
});

export const documentIrSchema = z.object({
  irVersion: z.literal(DOCUMENT_IR_VERSION),
  templateVersion: z.string().min(1),
  metadata: documentMetadataSchema,
  blocks: z.array(documentBlockSchema),
});

export type HeadingNode = z.infer<typeof headingNodeSchema>;
export type ParagraphNode = z.infer<typeof paragraphNodeSchema>;
export type TableNode = z.infer<typeof tableNodeSchema>;
export type ObjectRefNode = z.infer<typeof objectRefNodeSchema>;
export type PageBreakNode = z.infer<typeof pageBreakNodeSchema>;
export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
export type DocumentIr = z.infer<typeof documentIrSchema>;

/** 解析并校验未知输入是否为合法 Document IR。 */
export function parseDocumentIr(input: unknown): DocumentIr {
  return documentIrSchema.parse(input);
}

/** 校验已构建的 IR 是否满足 schema（构建器自检用）。 */
export function assertValidDocumentIr(ir: DocumentIr): DocumentIr {
  return documentIrSchema.parse(ir);
}

/** 稳定序列化：2 空格缩进，键序即对象字面量插入序，保证同 IR 同文本。 */
export function serializeDocumentIr(ir: DocumentIr): string {
  return JSON.stringify(ir, null, 2);
}

/** 汇总 IR 的可读统计，供生成脚本打印与断言。 */
export function summarizeDocumentIr(ir: DocumentIr): {
  blockTotal: number;
  headingTotal: number;
  tableTotal: number;
  objectRefTotal: number;
  objectRefCodes: string[];
} {
  let headingTotal = 0;
  let tableTotal = 0;
  const objectRefCodes: string[] = [];
  for (const block of ir.blocks) {
    if (block.type === 'heading') headingTotal += 1;
    else if (block.type === 'table') tableTotal += 1;
    else if (block.type === 'objectRef') objectRefCodes.push(block.code);
  }
  return {
    blockTotal: ir.blocks.length,
    headingTotal,
    tableTotal,
    objectRefTotal: objectRefCodes.length,
    objectRefCodes,
  };
}
