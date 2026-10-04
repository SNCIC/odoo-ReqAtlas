import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ROOT_ENV, resolveFixturePath } from '../fixtures';

/**
 * fixture 解析不得依赖 process.cwd()：其它包（spike/*）在各自包目录下运行时，
 * cwd 是其包目录，旧的 cwd 候选会全部落空。
 */

const original = process.env[FIXTURE_ROOT_ENV];

afterEach(() => {
  if (original === undefined) {
    delete process.env[FIXTURE_ROOT_ENV];
  } else {
    process.env[FIXTURE_ROOT_ENV] = original;
  }
});

describe('fixture 解析（cwd 无关）', () => {
  it('默认按模块位置解析到包内 fixtures 绝对路径', () => {
    const resolved = resolveFixturePath('demo-trade/model-bundle.json');
    const expected = fileURLToPath(
      new URL('../../fixtures/demo-trade/model-bundle.json', import.meta.url),
    );
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(existsSync(resolved)).toBe(true);
    expect(path.normalize(resolved)).toBe(path.normalize(expected));
  });

  it('demo-manufacturing 同样可解析', () => {
    const resolved = resolveFixturePath('demo-manufacturing/model-bundle.json');
    expect(existsSync(resolved)).toBe(true);
    expect(path.normalize(resolved)).toBe(
      path.normalize(
        fileURLToPath(
          new URL('../../fixtures/demo-manufacturing/model-bundle.json', import.meta.url),
        ),
      ),
    );
  });

  it('REQATLAS_FIXTURE_ROOT 显式覆盖为唯一根', () => {
    process.env[FIXTURE_ROOT_ENV] = path.resolve(process.cwd(), 'no-such-fixture-root-xyz');
    expect(() => resolveFixturePath('demo-trade/model-bundle.json')).toThrow(/fixture not found/);
  });
});
