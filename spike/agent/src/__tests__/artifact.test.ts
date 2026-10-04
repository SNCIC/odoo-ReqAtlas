import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_TRADE_BUNDLE_SHA256 } from '../anchor';
import { buildArtifactEnvelope } from '../artifacts';
import { sha256File } from '../hash';
import { demoTradeBundlePath } from '../load';

const bundlePath = demoTradeBundlePath();
const tempDir = mkdtempSync(path.join(tmpdir(), 'reqatlas-artifact-'));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('产物来源元数据：sourceBundleSha256', () => {
  it('metadata.sourceBundleSha256 == 重算值 == 冻结锚点（change-draft / change-set 均如此）', () => {
    const recomputed = sha256File(bundlePath);
    expect(recomputed).toBe(DEMO_TRADE_BUNDLE_SHA256);

    for (const kind of ['change-draft', 'change-set'] as const) {
      const envelope = buildArtifactEnvelope({
        kind,
        scenarioId: 'discount-approval',
        basedOnRevision: 1,
        bundlePath,
        payload: { placeholder: true },
      });
      expect(envelope.metadata.sourceBundleSha256).toBe(recomputed);
      expect(envelope.metadata.sourceBundleSha256).toBe(DEMO_TRADE_BUNDLE_SHA256);
      expect(envelope.metadata.basedOnRevision).toBe(1);
    }
  });

  it('记录的哈希经文件往返后仍 == 重算值（产物自证来源）', () => {
    const recomputed = sha256File(bundlePath);
    const filePath = path.join(tempDir, 'change-draft.sample.json');
    const envelope = buildArtifactEnvelope({
      kind: 'change-draft',
      scenarioId: 'sample',
      basedOnRevision: 1,
      bundlePath,
      payload: { sample: true },
    });
    writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf8');

    const roundTripped = JSON.parse(readFileSync(filePath, 'utf8')) as {
      metadata: { sourceBundleSha256: string; sourceBundlePath: string };
    };
    expect(roundTripped.metadata.sourceBundleSha256).toBe(recomputed);
    expect(roundTripped.metadata.sourceBundleSha256).toBe(DEMO_TRADE_BUNDLE_SHA256);
    // 元数据只记录相对路径，禁止写入本机绝对路径。
    expect(roundTripped.metadata.sourceBundlePath).toBe('demo-trade/model-bundle.json');
  });
});
