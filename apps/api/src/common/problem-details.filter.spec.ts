import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { ERROR_CODES, NON_CONTRACT_FALLBACK, type ProblemDetails } from '@reqatlas/contracts';
import { describe, expect, it } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter';
import {
  API_PRODUCIBLE_STATUSES,
  defaultCodeForStatus,
  isMappedStatus,
  STATUS_DEFAULT_CODE,
} from './status-code-map';

function fakeHost(requestId = 'req_test'): {
  host: ArgumentsHost;
  captured: { status?: number; type?: string; body?: ProblemDetails };
} {
  const captured: { status?: number; type?: string; body?: ProblemDetails } = {};
  interface FakeReply {
    status(code: number): FakeReply;
    type(value: string): FakeReply;
    send(payload: string): FakeReply;
  }
  const reply: FakeReply = {
    status(code: number): FakeReply {
      captured.status = code;
      return reply;
    },
    type(value: string): FakeReply {
      captured.type = value;
      return reply;
    },
    send(payload: string): FakeReply {
      captured.body = JSON.parse(payload) as ProblemDetails;
      return reply;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ requestId }),
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('problem+json status → code 映射（防止静默造码）', () => {
  it('apps/api 可产出的每个 HTTP 状态都被映射或显式声明为歧义', () => {
    const unmapped = API_PRODUCIBLE_STATUSES.filter((status) => !isMappedStatus(status));
    expect(unmapped).toEqual([]);
  });

  it('每个默认 code 都属于权威枚举，或为显式登记的非契约兜底码', () => {
    const known = new Set<string>([
      ...Object.values(ERROR_CODES),
      ...Object.values(NON_CONTRACT_FALLBACK),
    ]);
    for (const [status, code] of Object.entries(STATUS_DEFAULT_CODE)) {
      expect(known.has(code), `status ${status} → ${code} 不在已知集合内`).toBe(true);
    }
  });

  it('未映射状态不返回任何码（不得静默造码）', () => {
    expect(defaultCodeForStatus(418)).toBeUndefined();
    expect(isMappedStatus(418)).toBe(false);
  });

  it('未映射状态触发过滤器显式失败（不产出 HTTP_418 之类的非法 code）', () => {
    const { host } = fakeHost();
    expect(() => new ProblemDetailsFilter().catch(new HttpException('teapot', 418), host)).toThrow(
      /no stable error code mapped for HTTP 418/,
    );
  });

  it('无显式 code 的 404 → RESOURCE_NOT_FOUND', () => {
    const { host, captured } = fakeHost();
    new ProblemDetailsFilter().catch(new HttpException('nope', 404), host);
    expect(captured.status).toBe(404);
    expect(captured.type).toBe('application/problem+json');
    expect(captured.body?.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
  });

  it('显式合法 code（409 REVISION_CONFLICT）优先于状态映射', () => {
    const { host, captured } = fakeHost();
    new ProblemDetailsFilter().catch(
      new HttpException({ code: ERROR_CODES.REVISION_CONFLICT, message: 'conflict' }, 409),
      host,
    );
    expect(captured.status).toBe(409);
    expect(captured.body?.code).toBe(ERROR_CODES.REVISION_CONFLICT);
  });

  it('显式非法 code 被忽略，回退到状态映射（不产出非法值）', () => {
    const { host, captured } = fakeHost();
    new ProblemDetailsFilter().catch(
      new HttpException({ code: 'NOT_A_CODE', message: 'nope' }, 400),
      host,
    );
    expect(captured.body?.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('透传 context 到 problem+json', () => {
    const { host, captured } = fakeHost();
    new ProblemDetailsFilter().catch(
      new HttpException(
        { code: ERROR_CODES.VALIDATION_FAILED, message: 'missing', context: { field: 'x' } },
        400,
      ),
      host,
    );
    expect(captured.body?.context).toEqual({ field: 'x' });
  });
});
