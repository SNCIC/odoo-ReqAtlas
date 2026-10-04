import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_TRADE_BUNDLE_SHA256 } from '../src/anchor';
import { buildArtifactEnvelope } from '../src/artifacts';
import { applyDraft } from '../src/draft/apply';
import { createSchemaGuard } from '../src/guard/schema-guard';
import { createGoldenProvider, GOLDEN_SCENARIOS, getGoldenScenario } from '../src/golden/scenarios';
import { createDependencies } from '../src/harness';
import { sha256File } from '../src/hash';
import { demoTradeBundlePath, loadDemoTradeBundle } from '../src/load';
import { runAgent } from '../src/orchestrator';
import { OUT_DIR } from '../src/paths';

/**
 * 金样例端到端：中文输入 → ChangeDraft → 逐项接受 → ChangeSet。
 * 同时打印 bundle sha256 前后对比（证明模型无写权限）。
 */

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.slice(flag.length + 1);
}

async function main(): Promise<void> {
  const scenarioId = argValue('--scenario') ?? GOLDEN_SCENARIOS[0].id;
  const scenario = getGoldenScenario(scenarioId);

  const bundlePath = demoTradeBundlePath();
  const hashBefore = sha256File(bundlePath);
  const bundle = loadDemoTradeBundle();

  console.log('================ 金样例端到端 ================');
  console.log(`scenario     = ${scenario.id}（${scenario.title}）`);
  console.log(`bundle       = ${bundlePath}`);
  console.log(`objects      = ${bundle.modelObject.length}`);
  console.log(`sha256(before)= ${hashBefore}`);
  console.log(`input(中文)   = ${scenario.request.input.text}`);
  console.log('');

  const deps = createDependencies({
    bundle,
    provider: createGoldenProvider(scenario.id),
  });
  const outcome = await runAgent(scenario.request, deps);

  console.log('---- 最小上下文证据 ----');
  console.log(`上下文对象数        = ${outcome.context?.objects.length}（全部 ${bundle.modelObject.length}）`);
  console.log(`估算输入 token      = ${outcome.context?.estimatedInputTokens}`);
  console.log(`裁剪掉的候选数      = ${outcome.context?.droppedObjectCount}`);
  console.log(
    `上下文对象 code     = ${outcome.context?.objects.map((o) => o.code).join(', ')}`,
  );
  console.log('');

  if (!outcome.draft) {
    console.error('未产出草案：', outcome.run.error);
    process.exitCode = 1;
    return;
  }
  const draft = outcome.draft;

  console.log('---- ChangeDraft（中文输入 → 结构化差异草案）----');
  console.log(JSON.stringify(draft, null, 2));
  console.log('');

  const createdCodes = (draft.changes ?? [])
    .filter((c) => c.op === 'create' && c.targetType === 'model_object')
    .map((c) => String((c.after as Record<string, unknown> | null)?.code ?? ''));
  const referencedFinance = JSON.stringify(draft.changes).includes('ROLE-003');
  console.log('---- 对象复用证据 ----');
  console.log(`create 的 model_object code = [${createdCodes.join(', ')}]`);
  console.log(`草案是否引用既有 ROLE-003（财务） = ${referencedFinance}`);
  console.log('');

  const schemaGuard = createSchemaGuard();
  const accepted = (draft.changes ?? []).map((c) => c.operationId);
  const result = applyDraft({
    draft,
    selectedOperationIds: accepted,
    bundle,
    currentRevision: bundle.projectRevision,
    schemaGuard,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const draftEnvelope = buildArtifactEnvelope({
    kind: 'change-draft',
    scenarioId: scenario.id,
    basedOnRevision: draft.basedOnRevision,
    bundlePath,
    payload: draft,
  });
  writeFileSync(
    path.join(OUT_DIR, `change-draft.${scenario.id}.json`),
    JSON.stringify(draftEnvelope, null, 2),
    'utf8',
  );
  console.log('---- 产物来源元数据（change-draft）----');
  console.log(JSON.stringify(draftEnvelope.metadata, null, 2));
  console.log('');

  console.log('---- 逐项接受 → ChangeSet ----');
  if (!result.ok) {
    console.log(`apply 被拒（符合预期时可接受）：${result.problem?.code} - ${result.problem?.detail}`);
    if (result.problem?.context) {
      console.log(JSON.stringify(result.problem.context, null, 2));
    }
  } else {
    console.log(JSON.stringify(result.changeSet, null, 2));
    const changeSetEnvelope = buildArtifactEnvelope({
      kind: 'change-set',
      scenarioId: scenario.id,
      basedOnRevision: draft.basedOnRevision,
      bundlePath,
      payload: result.changeSet,
    });
    writeFileSync(
      path.join(OUT_DIR, `change-set.${scenario.id}.json`),
      JSON.stringify(changeSetEnvelope, null, 2),
      'utf8',
    );
    console.log('---- 产物来源元数据（change-set）----');
    console.log(JSON.stringify(changeSetEnvelope.metadata, null, 2));
    console.log(`ChangeSet 通过契约校验 = ${schemaGuard.validateChangeSet(result.changeSet).valid}`);
  }
  console.log('');

  const hashAfter = sha256File(bundlePath);
  console.log('---- 模型无写权限证据 ----');
  console.log(`sha256(after) = ${hashAfter}`);
  console.log(`不变          = ${hashAfter === hashBefore}`);
  console.log(`产物记录哈希  = ${draftEnvelope.metadata.sourceBundleSha256}`);
  console.log(
    `记录==重算==冻结锚点 = ${
      draftEnvelope.metadata.sourceBundleSha256 === hashAfter &&
      hashAfter === DEMO_TRADE_BUNDLE_SHA256
    }`,
  );
  console.log(`产出目录      = ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
