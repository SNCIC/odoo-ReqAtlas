import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getGoldenScenario } from '../golden/scenarios';
import { planDraft } from '../golden/planner';
import { createDependencies } from '../harness';
import { loadDemoTradeBundle } from '../load';
import { runAgent } from '../orchestrator';
import { FakeProvider } from '../provider/fake-provider';
import { REPO_ROOT } from '../paths';
import { createSchemaGuard } from '../guard/schema-guard';

const guard = createSchemaGuard();
const examplesDir = path.join(REPO_ROOT, 'docs', 'api', 'examples');

function readExample(name: string): unknown {
  return JSON.parse(readFileSync(path.join(examplesDir, name), 'utf8'));
}

describe('Schema Guard：直接以契约为验证源', () => {
  it('注册了契约 schema（含 change-draft / change-set / problem）', () => {
    expect(guard.schemaIds).toContain('change-draft.json');
    expect(guard.schemaIds).toContain('change-set.json');
    expect(guard.schemaIds).toContain('problem.json');
  });

  it('契约示例 change-draft-response.json 通过校验', () => {
    const result = guard.validateDraft(readExample('change-draft-response.json'));
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('契约示例 change-set-request.json 通过校验', () => {
    const result = guard.validateChangeSet(readExample('change-set-request.json'));
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('契约示例 problem-revision-conflict.json 通过校验', () => {
    const result = guard.validateProblem(readExample('problem-revision-conflict.json'));
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('缺失必填字段的草案被拒绝', () => {
    const bad = { draftId: 'd1', scope: { type: 'project', id: 'p' } };
    expect(guard.validateDraft(bad).valid).toBe(false);
  });

  it('未知枚举（intent）被拒绝', () => {
    const draft = readExample('change-draft-response.json') as Record<string, unknown>;
    const result = guard.validateDraft({ ...draft, intent: 'not-an-intent' });
    expect(result.valid).toBe(false);
  });
});

const bundle = loadDemoTradeBundle();
const scenario = getGoldenScenario('discount-approval');

describe('格式失败最多自动修复一次', () => {
  it('首次畸形、其次合法 → 修复成功后 succeeded，调用 2 次', async () => {
    let calls = 0;
    const provider = new FakeProvider({
      respond: (req) => {
        calls += 1;
        if (calls === 1) return '{ 这不是合法 JSON';
        return JSON.stringify(
          planDraft('discount-approval', {
            candidates: req.metadata?.candidates ?? [],
            inputText: req.metadata?.inputText ?? '',
          }),
        );
      },
    });
    const deps = createDependencies({ bundle, provider });
    const outcome = await runAgent(scenario.request, deps);
    expect(outcome.run.status).toBe('succeeded');
    expect(outcome.providerCalls).toBe(2);
    expect(calls).toBe(2);
  });

  it('修复一次仍失败 → 拒绝（failed），且不超过 maxRepair+1 次调用', async () => {
    const provider = new FakeProvider({ respond: () => '{ 一直畸形' });
    const deps = createDependencies({ bundle, provider, policy: { maxRepair: 1 } });
    const outcome = await runAgent(scenario.request, deps);
    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.error?.code).toBe('VALIDATION_FAILED');
    expect(outcome.providerCalls).toBe(2);
    expect(outcome.providerCalls).toBeLessThanOrEqual(2);
  });

  it('可解析但违反 Schema → 修复一次；仍违反则拒绝', async () => {
    const provider = new FakeProvider({ respond: () => JSON.stringify({ draftId: 'x' }) });
    const deps = createDependencies({ bundle, provider, policy: { maxRepair: 1 } });
    const outcome = await runAgent(scenario.request, deps);
    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.error?.code).toBe('VALIDATION_FAILED');
    expect(outcome.providerCalls).toBe(2);
  });
});
