import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_TRADE_BUNDLE_BYTES, DEMO_TRADE_BUNDLE_SHA256 } from '../anchor';
import { buildArtifactEnvelope } from '../artifacts';
import { applyDraft } from '../draft/apply';
import { createSchemaGuard } from '../guard/schema-guard';
import { createGoldenProvider, GOLDEN_SCENARIOS } from '../golden/scenarios';
import { createDependencies } from '../harness';
import { sha256File } from '../hash';
import { demoTradeBundlePath, loadDemoTradeBundle } from '../load';
import { runAgent } from '../orchestrator';

/**
 * 关键证据：整条 Agent 链路（草案生成 → Schema/Domain 双校验 → 逐项 apply → ChangeSet）
 * 跑完后，`model-bundle.json` 的 sha256 必须逐字符不变——证明「模型无数据库写权限」。
 */
describe('模型无写权限：冻结 bundle 前后一致', () => {
  it('跑完全部金样例后 sha256 与字节数不变，且等于 M0 冻结锚点', async () => {
    const bundlePath = demoTradeBundlePath();
    const bytesBefore = readFileSync(bundlePath).length;
    const hashBefore = sha256File(bundlePath);
    expect(hashBefore).toBe(DEMO_TRADE_BUNDLE_SHA256);
    expect(bytesBefore).toBe(DEMO_TRADE_BUNDLE_BYTES);

    const bundle = loadDemoTradeBundle();
    const schemaGuard = createSchemaGuard();
    let appliedTotal = 0;

    for (const scenario of GOLDEN_SCENARIOS) {
      const deps = createDependencies({ bundle, provider: createGoldenProvider(scenario.id) });
      const outcome = await runAgent(scenario.request, deps);
      const draft = outcome.draft;
      expect(draft, `样例 ${scenario.id} 应产出草案`).toBeDefined();
      const opIds = (draft!.changes ?? []).map((c) => c.operationId);

      // 产物来源元数据：记录的哈希必须 == 重算值 == 冻结锚点。
      const draftEnvelope = buildArtifactEnvelope({
        kind: 'change-draft',
        scenarioId: scenario.id,
        basedOnRevision: draft!.basedOnRevision,
        bundlePath,
        payload: draft!,
      });
      expect(draftEnvelope.metadata.sourceBundleSha256).toBe(sha256File(bundlePath));
      expect(draftEnvelope.metadata.sourceBundleSha256).toBe(DEMO_TRADE_BUNDLE_SHA256);
      expect(schemaGuard.validateDraft(draftEnvelope.payload).valid).toBe(true);

      if (draft!.validation.blocking.length > 0) {
        // 含阻断项（职责冲突）→ 不可应用，证实「阻断项不可 apply」。
        const refused = applyDraft({
          draft: draft!,
          selectedOperationIds: opIds,
          bundle,
          currentRevision: bundle.projectRevision,
          schemaGuard,
        });
        expect(refused.ok).toBe(false);
        expect(refused.problem?.code).toBe('DOMAIN_RULE_BLOCKED');
        continue;
      }

      // 逐项接受：只选择其中一个 + 全部（验证选择性仍有产物）
      const accepted = opIds.length > 1 ? opIds.slice(0, opIds.length - 1) : opIds;
      const result = applyDraft({
        draft: draft!,
        selectedOperationIds: accepted,
        bundle,
        currentRevision: bundle.projectRevision,
        schemaGuard,
      });
      expect(result.ok, `样例 ${scenario.id} apply 应成功`).toBe(true);
      expect(result.changeSet).toBeDefined();
      const validated = schemaGuard.validateChangeSet(result.changeSet);
      expect(validated.valid, validated.errors.join('; ')).toBe(true);
      appliedTotal += accepted.length;

      // ChangeSet 产物的来源元数据同样必须 == 重算值 == 冻结锚点。
      const changeSetEnvelope = buildArtifactEnvelope({
        kind: 'change-set',
        scenarioId: scenario.id,
        basedOnRevision: draft!.basedOnRevision,
        bundlePath,
        payload: result.changeSet!,
      });
      expect(changeSetEnvelope.metadata.sourceBundleSha256).toBe(sha256File(bundlePath));
      expect(changeSetEnvelope.metadata.sourceBundleSha256).toBe(DEMO_TRADE_BUNDLE_SHA256);
    }

    expect(appliedTotal).toBeGreaterThan(0);

    // 主断言：链路前后哈希相等（由被测数据派生，不脆弱）。
    const hashAfter = sha256File(bundlePath);
    const bytesAfter = readFileSync(bundlePath).length;
    expect(hashAfter).toBe(hashBefore);
    // 并列核对：等于 M0 冻结锚点（一次性锚点，见 anchor.ts 说明）。
    expect(hashAfter).toBe(DEMO_TRADE_BUNDLE_SHA256);
    expect(bytesAfter).toBe(bytesBefore);
  });
});
