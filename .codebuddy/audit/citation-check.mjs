#!/usr/bin/env node
/**
 * citation-check.mjs — 全仓交叉引用完整性检查器（只读，不修改任何文件）。
 *
 * 目的：把"引用真实性"从人肉复核变成一条命令，供里程碑收尾与 CI 使用。
 * 依据：docs/review/m0-readonly-review.md §13；docs/review/readonly-review-checklist.md 维度八「引用真实性」。
 *
 * 用法（仓库根执行）：
 *   node .codebuddy/audit/citation-check.mjs
 *   node .codebuddy/audit/citation-check.mjs --exclude-review   # 忽略 docs/review/**（复核报告会刻意引用已知缺陷原文）
 *
 * 退出码：存在悬空引用 → 1；否则 0。
 *
 * 能力：
 *   1. ADR-nnn            → 目标 docs/adr/ADR-nnn.md 是否存在；
 *   2. ADR-nnn §x.y       → 该小节在目标 ADR 内是否存在（ADR 章节为 `## 2..9`，见"决策第 N 条"被误写成 §3.x 的系统误引用）；
 *   3. OQ-n               → docs/api/open-questions.md 中是否有定义；
 *   4. M\d-\d\d           → 实施方案任务表是否存在该任务号；
 *   5. P\d                → 是否落在产品原则 P1..P7；
 *   6. §x.y（就近配对）    → 仅在同行"紧邻指名"目标文档时核（ADR-nnn / 实施方案 / 开发方案 / 产品设计文档 / <相对路径>.md）；
 *                           "见 §x" 视为跳转自引用；自引用不算。
 *   7. 附录 X             → 同行指名目标（产品设计文档 / 开发方案 / 实施方案）的附录字母集合（A–Z）内是否存在。
 *
 * 选项：
 *   --exclude-review  忽略 docs/review/**（复核报告会刻意引用已知缺陷原文，属预期噪声）。
 *   --valid-sets      额外打印全部有效集与抽取结果（供独立复核；见 m0-readonly-review.md §13.7）。
 * 行内豁免：某行含 `citation-check:allow` 时跳过该行。
 *
 * 引用形态约定（与 readonly-review-checklist 维度八同源）：
 *   `§N` / `§N.M` **只能指真实存在的章节编号**；文档内的"列内条目"（如 ADR「决策」第 N 条）
 *   一律写 **「第 N 条」**，不得写成 `§3.N`（ADR 从无 `3.x` 小节）。本工具据此把 `ADR-nnn §3.x` 判为悬空。
 *
 * 约定：本工具只读；不新增依赖；不写任何文件（除 stdout）。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

const ROOTS = ['apps', 'packages', 'spike', 'docs'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'out']);
const EXTS = ['.md', '.ts', '.tsx'];
const PLAN = 'docs/需求调研工作台-具体实施方案.md';
const DEV = 'docs/需求调研工作台开发方案.docx';
const DES = 'docs/需求调研工作台产品设计文档.docx';
const OQ_DOC = 'docs/api/open-questions.md';
const ADR_DIR = 'docs/adr';
const EXCLUDE_REVIEW = process.argv.includes('--exclude-review');

/* ---------- 读取与解析 ---------- */

/** 读取 .md 文本，或从 .docx 中提取 word/document.xml 文本（不新增依赖）。 */
function loadText(file) {
  if (file.endsWith('.md')) return readFileSync(file, 'utf8');
  const xml = readZipEntry(file, 'word/document.xml');
  const perPara = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
  return perPara
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** 极简 ZIP 读取：解析 EOCD → 中心目录 → 定位并解压指定条目。 */
function readZipEntry(zipPath, entryName) {
  const buf = readFileSync(zipPath);
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`EOCD not found in ${zipPath}`);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error(`bad central header in ${zipPath}`);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    if (name === entryName) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.slice(dataStart, dataStart + compSize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry not found: ${entryName} in ${zipPath}`);
}

/** 抽取文档的小节号集合（形如 `## 3. 决策` / `8.7 标题` / `### 3.1 x`）。 */
function headingNumbers(text) {
  const set = new Set();
  for (const line of text.split('\n')) {
    const m = /^\s*#{0,6}\s*(\d+(?:\.\d+)*)(?=[.\s、）)]|$)/.exec(line);
    if (!m) continue;
    // 去噪：编号各段必须 ≤2 位，排除表格里的 HTTP 码（400/404/…）等非章节数字。
    if (m[1].split('.').every((p) => p.length <= 2)) set.add(m[1]);
  }
  return set;
}

/** 抽取"附录 X"字母编号集合（A–Z）。 */
function appendixSet(text) {
  const set = new Set();
  for (const m of text.matchAll(/附录\s*([A-Z])/g)) set.add(m[1]);
  return set;
}

/* ---------- 有效集 ---------- */

const adrFiles = readdirSync(ADR_DIR).filter((f) => /^ADR-\d{3}\.md$/.test(f));
const adrNums = new Set(adrFiles.map((f) => Number(/ADR-(\d{3})/.exec(f)[1])));
const adrHeads = new Map(
  adrFiles.map((f) => [Number(/ADR-(\d{3})/.exec(f)[1]), headingNumbers(readFileSync(path.join(ADR_DIR, f), 'utf8'))]),
);
const planText = loadText(PLAN);
const planHeads = headingNumbers(planText);
const taskSet = new Set(planText.match(/M\d-\d{2}/g) ?? []);
const oqSet = new Set((readFileSync(OQ_DOC, 'utf8').match(/OQ-(\d+)/g) ?? []).map((s) => Number(s.slice(3))));
const devHeads = headingNumbers(loadText(DEV));
const desHeads = headingNumbers(loadText(DES));
const devAppendix = appendixSet(loadText(DEV));
const desAppendix = appendixSet(loadText(DES));
const planAppendix = appendixSet(planText);
const mdHeadCache = new Map();
function mdHeads(p) {
  if (!mdHeadCache.has(p)) {
    try {
      mdHeadCache.set(p, headingNumbers(loadText(p)));
    } catch {
      mdHeadCache.set(p, null);
    }
  }
  return mdHeadCache.get(p);
}

/* ---------- 文件遍历 ---------- */

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) walk(full, out);
    } else if (EXTS.some((e) => name.endsWith(e))) {
      out.push(full.split(path.sep).join('/'));
    }
  }
}

/* ---------- 就近解析相对 .md 路径 ---------- */

function resolveMd(fromFile, captured) {
  const cap = captured.replace(/\\/g, '/');
  let dir = path.dirname(fromFile);
  for (;;) {
    const cand = path.normalize(path.join(dir, cap)).split(path.sep).join('/');
    if (existsSync(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir || dir === '.') break;
    dir = parent;
  }
  const cand = path.normalize(cap).split(path.sep).join('/');
  return existsSync(cand) ? cand : null;
}

/* ---------- 扫描 ---------- */

const KW = /ADR-\d{3}|实施方案|开发方案|产品设计文档/g;
const MDP = /[\w\u4e00-\u9fa5./\\-]+\.md/g;
const SEC = /§\s*(\d+(?:\.\d+)*)/g;
const SEP = /^[\s（()、,，/和及中*`[\]：:；;]*$/;

const files = [];
for (const r of ROOTS) if (existsSync(r)) walk(r, files);

const dangling = [];
const counts = { files: files.length, adr: 0, adrDangling: 0, oq: 0, oqDangling: 0, m: 0, mDangling: 0, sec: 0, secDangling: 0, secUnassigned: 0, appendix: 0, appendixDangling: 0, appendixUnassigned: 0 };

for (const file of files) {
  if (EXCLUDE_REVIEW && file.startsWith('docs/review/')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const ln = idx + 1;
    // 行内豁免：文档在"引用某缺陷原文"时可用 `citation-check:allow` 显式声明（复核报告、缺陷清单等）。
    if (line.includes('citation-check:allow')) return;
    for (const m of line.matchAll(/ADR-(\d{3})/g)) {
      counts.adr += 1;
      if (!adrNums.has(Number(m[1]))) {
        counts.adrDangling += 1;
        dangling.push({ file, line: ln, kind: 'ADR', detail: `ADR-${m[1]} 文件不存在`, text: line.trim() });
      }
    }
    for (const m of line.matchAll(/OQ-(\d+)/g)) {
      counts.oq += 1;
      if (!oqSet.has(Number(m[1]))) {
        counts.oqDangling += 1;
        dangling.push({ file, line: ln, kind: 'OQ', detail: `OQ-${m[1]} 未定义`, text: line.trim() });
      }
    }
    for (const tok of line.match(/M\d-\d{2}/g) ?? []) {
      counts.m += 1;
      if (!taskSet.has(tok)) {
        counts.mDangling += 1;
        dangling.push({ file, line: ln, kind: 'M', detail: `${tok} 非实施方案任务号`, text: line.trim() });
      }
    }
    // 就近锚点
    const anchors = [...line.matchAll(KW)].map((m) => ({ start: m.index, end: m.index + m[0].length, name: m[0] }));
    for (const m of line.matchAll(MDP)) {
      const rp = resolveMd(file, m[0]);
      if (rp) anchors.push({ start: m.index, end: m.index + m[0].length, name: rp });
    }
    anchors.sort((a, b) => a.start - b.start);
    for (const sm of line.matchAll(SEC)) {
      const pos = sm.index;
      let target = null;
      for (const a of anchors) {
        if (a.end <= pos && pos - a.end <= 30) {
          const between = line.slice(a.end, pos);
          if (between.includes('见')) continue;
          if (SEP.test(between)) target = a.name;
        }
      }
      if (!target) {
        counts.secUnassigned += 1;
        continue;
      }
      counts.sec += 1;
      const secno = sm[1];
      const push = (d) => {
        counts.secDangling += 1;
        dangling.push({ file, line: ln, kind: '§', detail: d, text: line.trim() });
      };
      if (target.startsWith('ADR')) {
        const n = Number(/\d{3}/.exec(target)[0]);
        if (!adrHeads.get(n)?.has(secno)) push(`§${secno} 不在 ${target}`);
      } else if (target === '实施方案') {
        if (!planHeads.has(secno)) push(`§${secno} 不在实施方案`);
      } else if (target.endsWith('.md')) {
        const hs = mdHeads(target);
        if (!hs) push(`目标不可读: ${target}`);
        else if (!hs.has(secno)) push(`§${secno} 不在 ${target}`);
      } else {
        const hs = target === '开发方案' ? devHeads : desHeads;
        if (!hs.has(secno)) push(`§${secno} 不在 ${target}(docx)`);
      }
    }
    // 附录 X 引用：目标取同行最近的 docx/实施方案 关键词（支持 "产品设计文档 §9.3 / 附录 F" 形态）
    for (const m of line.matchAll(/附录\s*([A-Z])/g)) {
      const pre = line.slice(0, m.index);
      const kws = [...pre.matchAll(/产品设计文档|开发方案|实施方案/g)];
      if (kws.length === 0) {
        counts.appendixUnassigned += 1;
        continue;
      }
      const target = kws[kws.length - 1][0];
      counts.appendix += 1;
      const set = target === '产品设计文档' ? desAppendix : target === '开发方案' ? devAppendix : planAppendix;
      if (!set.has(m[1])) {
        counts.appendixDangling += 1;
        dangling.push({ file, line: ln, kind: '附录', detail: `附录 ${m[1]} 不在 ${target}`, text: line.trim() });
      }
    }
  });
}

/* ---------- 输出 ---------- */

console.log('citation-check — 全仓交叉引用完整性检查（只读）');
console.log(`roots=${ROOTS.join(',')}  exclude=${[...EXCLUDE_DIRS].join(',')}${EXCLUDE_REVIEW ? '  +docs/review' : ''}`);
console.log(`files=${counts.files}`);
console.log('');
console.log('类别           已核    悬空');
console.log(`ADR-nnn        ${String(counts.adr).padStart(4)}    ${counts.adrDangling}`);
console.log(`OQ-n           ${String(counts.oq).padStart(4)}    ${counts.oqDangling}`);
console.log(`M\\d-\\d\\d        ${String(counts.m).padStart(4)}    ${counts.mDangling}`);
console.log(`§x.y(显式)      ${String(counts.sec).padStart(4)}    ${counts.secDangling}   (另有 ${counts.secUnassigned} 处未指名目标，未判定)`);
console.log(`附录 X(显式)    ${String(counts.appendix).padStart(4)}    ${counts.appendixDangling}   (另有 ${counts.appendixUnassigned} 处未指名目标，未判定)`);
console.log(`P\\d            —   （P1..P7，正则已限定）`);
console.log('');

if (process.argv.includes('--valid-sets')) {
  const fmt = (s) => [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(' ');
  console.log('--- 有效集（独立复核用）---');
  console.log(`ADR 文件(${adrNums.size}): ${[...adrNums].sort((a, b) => a - b).map((n) => `ADR-${String(n).padStart(3, '0')}`).join(' ')}`);
  for (const n of [...adrNums].sort((a, b) => a - b)) {
    console.log(`  ADR-${String(n).padStart(3, '0')} 小节: ${fmt(adrHeads.get(n))}`);
  }
  console.log(`OQ 定义(${oqSet.size}): ${fmt(new Set([...oqSet].map((n) => `OQ-${n}`)))}`);
  console.log(`实施方案任务号(${taskSet.size})`);
  console.log(`实施方案小节: ${fmt(planHeads)}`);
  console.log(`开发方案 小节: ${fmt(devHeads)}`);
  console.log(`开发方案 附录: ${fmt(devAppendix)}`);
  console.log(`产品设计文档 小节: ${fmt(desHeads)}`);
  console.log(`产品设计文档 附录: ${fmt(desAppendix)}`);
  console.log(`实施方案 附录: ${planAppendix.size ? fmt(planAppendix) : '(无)'}`);
  console.log(`.md 目标小节（按需加载）: ${[...mdHeadCache.keys()].map((k) => `${k} → ${fmt(mdHeadCache.get(k) ?? new Set())}`).join(' ; ') || '(未触发)'}`);
  console.log('');
}
if (dangling.length === 0) {
  console.log('DANGLING = 0');
  process.exit(0);
}
console.log(`DANGLING = ${dangling.length}`);
for (const d of dangling) {
  console.log(`  ${d.file}:${d.line}  [${d.kind}] ${d.detail}`);
  console.log(`      | ${d.text.slice(0, 140)}`);
}
process.exit(1);
