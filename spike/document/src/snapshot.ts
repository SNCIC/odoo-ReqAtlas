/**
 * 快照标识：对源 ModelBundle 的**原始文件字节**计算 sha256。
 *
 * 一致性与可复现的基点是「同一份字节」而不是「同一份解析结果」：
 * 直接对 fixture 文件字节取哈希，避免 JSON 序列化差异带来的歧义。
 * 生成前后都会校验哈希不变，确保 spike 从未修改源 bundle。
 *
 * fixture 解析与校验全部走 `@reqatlas/testkit` 官方 API：
 * `resolveFixturePath`（模块位置基准，不依赖 cwd）+ `parseModelBundle`（zod schema）。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseModelBundle, resolveFixturePath, type ModelBundle } from '@reqatlas/testkit';

export const DEMO_TRADE_FIXTURE = 'demo-trade/model-bundle.json';

export interface LoadedSnapshot {
  /** fixture 相对路径（如 `demo-trade/model-bundle.json`）。 */
  relativePath: string;
  /** 解析出的绝对路径。 */
  absolutePath: string;
  /** 原始文件字节的 sha256（快照标识）。 */
  sha256: string;
  /** 原始字节长度。 */
  bytes: number;
  /** 通过 @reqatlas/testkit schema 校验后的模型。 */
  bundle: ModelBundle;
}

/** 对文件字节计算 sha256。 */
export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** 对字符串计算 sha256（十六进制）。 */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 对任意字节缓冲区计算 sha256（十六进制）。 */
export function sha256Buffer(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * 从 @reqatlas/testkit 加载 demo-trade 快照并计算标识。
 *
 * 对**同一份读入字节**取哈希并用 testkit schema 校验，避免解析两次产生 TOCTOU。
 */
export function loadDemoTradeSnapshot(relativePath = DEMO_TRADE_FIXTURE): LoadedSnapshot {
  const absolutePath = resolveFixturePath(relativePath);
  const raw = readFileSync(absolutePath);
  const bundle = parseModelBundle(JSON.parse(raw.toString('utf8')));
  return {
    relativePath,
    absolutePath,
    sha256: createHash('sha256').update(raw).digest('hex'),
    bytes: raw.byteLength,
    bundle,
  };
}

/** 重新读取并断言快照哈希未变化（生成前后校验源 bundle 未被改动）。 */
export function assertSnapshotUnchanged(snapshot: LoadedSnapshot): void {
  const after = sha256File(snapshot.absolutePath);
  if (after !== snapshot.sha256) {
    throw new Error(
      `snapshot hash changed: before=${snapshot.sha256} after=${after}; 源 bundle 被改动，Spike 结果不可复现`,
    );
  }
}
