/**
 * DOCX 渲染器（M0-07 Spike）。
 *
 * 输入只有 Document IR —— 本模块**不 import ModelBundle**，从结构上证明
 * 「内容（IR）」与「格式（DOCX）」解耦（ADR-008）。
 *
 * 中文字体：docx 的 run 级 `font` 支持按字符集分别指定，因此显式设置
 * `eastAsia`（中文）与 `ascii/hAnsi`（西文），避免 Word 用默认拉丁字体渲染中文。
 */
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IShadingAttributesProperties,
} from 'docx';
import { TextWatermark } from 'docx/watermarks';
import type { DocumentBlock, DocumentIr } from './document-ir';

/** 字体属性：docx 允许按字符集分别指定 font。 */
export interface FontAttrs {
  ascii: string;
  hAnsi: string;
  eastAsia: string;
  cs: string;
}

/** 正文中文字体：宋体；西文用 Times New Roman。 */
export const BODY_FONT: FontAttrs = {
  ascii: 'Times New Roman',
  hAnsi: 'Times New Roman',
  eastAsia: 'SimSun',
  cs: 'SimSun',
};

/** 标题中文字体：黑体；西文用 Arial。 */
export const HEADING_FONT: FontAttrs = {
  ascii: 'Arial',
  hAnsi: 'Arial',
  eastAsia: 'SimHei',
  cs: 'SimHei',
};

const HEADER_SHADING: IShadingAttributesProperties = { fill: 'E7E6E6' };

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];

function headingLevelOf(level: number): HeadingLevelValue {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    default:
      return HeadingLevel.HEADING_4;
  }
}

/** 生成带显式中文字体的文本 run。 */
function run(
  text: string,
  options: { bold?: boolean; size?: number; color?: string; font?: FontAttrs } = {},
): TextRun {
  return new TextRun({
    text,
    bold: options.bold,
    size: options.size,
    color: options.color,
    font: options.font ?? BODY_FONT,
  });
}

function cell(text: string, isHeader: boolean): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        spacing: { before: 20, after: 20 },
        children: [run(text, { bold: isHeader, size: 18, font: isHeader ? HEADING_FONT : BODY_FONT })],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    shading: isHeader ? HEADER_SHADING : undefined,
  });
}

function renderTable(block: Extract<DocumentBlock, { type: 'table' }>): (Paragraph | Table)[] {
  const headerRow = new TableRow({
    tableHeader: true,
    children: block.header.map((h) => cell(h, true)),
  });
  const bodyRows = block.rows.map(
    (r) => new TableRow({ children: r.map((c) => cell(c, false)) }),
  );
  const out: (Paragraph | Table)[] = [];
  if (block.caption) {
    out.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [run(block.caption, { bold: true, size: 20, font: HEADING_FONT })],
      }),
    );
  }
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    }),
  );
  return out;
}

function renderBlock(block: DocumentBlock): (Paragraph | Table)[] {
  switch (block.type) {
    case 'heading': {
      const text = block.number ? `${block.number} ${block.text}` : block.text;
      return [
        new Paragraph({
          heading: headingLevelOf(block.level),
          spacing: { before: 240, after: 120 },
          children: [run(text, { bold: true, font: HEADING_FONT, color: '1F3864' })],
        }),
      ];
    }
    case 'paragraph': {
      if (block.role === 'watermark') {
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 240 },
            children: [run(block.text, { bold: true, color: 'C00000' })],
          }),
        ];
      }
      return [
        new Paragraph({
          spacing: { before: 40, after: 80 },
          children: [run(block.text, { color: block.role === 'note' ? '595959' : undefined })],
        }),
      ];
    }
    case 'table':
      return renderTable(block);
    case 'objectRef': {
      const out: Paragraph[] = [
        new Paragraph({
          spacing: { before: 160, after: 20 },
          children: [
            run(`【${block.code}】`, { bold: true, font: HEADING_FONT }),
            run(` ${block.title}`, { bold: false }),
            run(`（${block.kind}${block.state ? ` / ${block.state}` : ''}）`, {
              color: '808080',
              size: 18,
            }),
          ],
        }),
      ];
      if (block.note) {
        out.push(
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [run(block.note, { color: '595959', size: 18 })],
          }),
        );
      }
      return out;
    }
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    default:
      return [];
  }
}

/** 页眉：DRAFT 文字水印（VML），重复出现在每一页。 */
function buildWatermarkHeader(): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: [
              new TextWatermark({
                text: 'DRAFT',
                font: 'Arial',
                color: 'C0C0C0',
                opacity: 0.4,
                layout: 'diagonal',
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** 页脚：第 X 页 / 共 Y 页。 */
function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            font: BODY_FONT,
            children: ['第 ', PageNumber.CURRENT, ' 页 / 共 ', PageNumber.TOTAL_PAGES, ' 页'],
          }),
        ],
      }),
    ],
  });
}

/** 由 Document IR 构建 docx `Document`（纯函数，不含 I/O，便于确定性比对）。 */
export function renderDocumentIrToDocx(ir: DocumentIr): Document {
  const children: (Paragraph | Table)[] = [];
  for (const block of ir.blocks) children.push(...renderBlock(block));

  return new Document({
    creator: 'ReqAtlas M0-07 document spike',
    title: '现状调研报告',
    description: `snapshot=${ir.metadata.snapshotSha256} template=${ir.templateVersion}`,
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 21 } },
        heading1: {
          run: { font: HEADING_FONT, size: 32, bold: true, color: '1F3864' },
        },
        heading2: { run: { font: HEADING_FONT, size: 26, bold: true, color: '2E5496' } },
        heading3: { run: { font: HEADING_FONT, size: 24, bold: true, color: '2E5496' } },
        heading4: { run: { font: HEADING_FONT, size: 22, bold: true, color: '2E5496' } },
      },
    },
    sections: [
      {
        headers: { default: buildWatermarkHeader() },
        footers: { default: buildFooter() },
        children,
      },
    ],
  });
}

/** 渲染并打包为 DOCX 字节。 */
export async function renderDocumentIrToBuffer(ir: DocumentIr): Promise<Buffer> {
  return Packer.toBuffer(renderDocumentIrToDocx(ir));
}
