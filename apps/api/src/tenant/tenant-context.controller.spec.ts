import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test-utils/create-test-app';

describe('tenant context (M1-04)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('缺少 x-tenant-id 时拒绝并返回 problem+json / VALIDATION_FAILED（含 context.field）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/tenant-context' });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = response.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.context).toEqual({ field: 'x-tenant-id' });
    expect(body.requestId).toMatch(/^req_[A-Za-z0-9_-]+$/);
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('携带 x-tenant-id 时回显租户上下文', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant-context',
      headers: { 'x-tenant-id': 'tenant-acme' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.tenantId).toBe('tenant-acme');
  });
});
