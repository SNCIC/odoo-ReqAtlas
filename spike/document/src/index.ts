/**
 * @reqatlas/spike-document —— M0-07 文档 Spike 公共入口。
 *
 * 链路：ModelBundle（不可变快照）→ Document IR → DOCX（docx 库）→（可选）LibreOffice PDF。
 */
export * from './document-ir';
export * from './snapshot';
export * from './model-to-ir';
export * from './render-docx';
export * from './soffice';
export * from './pipeline';
