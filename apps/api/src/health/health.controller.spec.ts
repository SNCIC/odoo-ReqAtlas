import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test-utils/create-test-app';

const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_-]+$/;

describe('GET /api/v1/health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('返回 { data, meta: { requestId } } 结构', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({
      status: 'ok',
      service: '@reqatlas/api',
    });
    expect(typeof body.data.version).toBe('string');
    expect(typeof body.data.uptimeSeconds).toBe('number');
    expect(body.meta.requestId).toMatch(REQUEST_ID_PATTERN);
  });

  it('无入站 X-Request-Id 时生成受控 req_* 并回写响应头', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const header = response.headers['x-request-id'];

    expect(typeof header).toBe('string');
    expect(header).toMatch(REQUEST_ID_PATTERN);
    expect(response.json().meta.requestId).toBe(header);
  });
});
