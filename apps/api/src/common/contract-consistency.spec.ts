import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES, ERROR_CODE_HTTP_STATUS, NON_CONTRACT_FALLBACK } from '@reqatlas/contracts';
import { describe, expect, it } from 'vitest';

/**
 * 跨产物一致性守卫（本次契约违约事故的根治措施）。
 *
 * `packages/contracts` 手写的 `ERROR_CODES` 与权威契约
 * `docs/api/schemas/error-code.json` 会漂移——此测试把它永久钉死：
 * - 集合必须相等（不多不少）；
 * - 每个 code 的 HTTP 映射必须与 `$comment` 中的机器可读映射一致。
 *
 * 放在 apps/api 而非 packages/contracts，是为遵守「暂不跑 pnpm install」的约束：
 * apps/api 已声明 vitest/@types/node，无需新增依赖与锁文件变更。
 */
const SCHEMA_PATH = fileURLToPath(
  new URL('../../../../docs/api/schemas/error-code.json', import.meta.url),
);

interface ErrorCodeSchema {
  enum: string[];
  $comment: string;
}

function loadSchema(): ErrorCodeSchema {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as ErrorCodeSchema;
}

function machineReadableHttpMap(comment: string): Record<string, number> {
  const match = comment.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('error-code.json 的 $comment 中未找到机器可读 HTTP 映射');
  }
  return JSON.parse(match[0]) as Record<string, number>;
}

describe('contracts ERROR_CODES ↔ docs/api/schemas/error-code.json（跨产物一致性）', () => {
  it('ERROR_CODES 与权威 enum 集合相等', () => {
    const schema = loadSchema();
    expect(Object.values(ERROR_CODES).sort()).toEqual([...schema.enum].sort());
  });

  it('ERROR_CODE_HTTP_STATUS 与 $comment 的机器可读映射一致', () => {
    const schema = loadSchema();
    const authoritative = machineReadableHttpMap(schema.$comment);
    const ours: Record<string, number> = {};
    for (const [code, status] of Object.entries(ERROR_CODE_HTTP_STATUS)) {
      ours[code] = status;
    }
    expect(ours).toEqual(authoritative);
  });

  it('NON_CONTRACT_FALLBACK 与 ERROR_CODES 无交集（违约被显式隔离）', () => {
    const contract = new Set<string>(Object.values(ERROR_CODES));
    for (const code of Object.values(NON_CONTRACT_FALLBACK)) {
      expect(contract.has(code), `${code} 不应出现在权威 ERROR_CODES 内`).toBe(false);
    }
  });
});
