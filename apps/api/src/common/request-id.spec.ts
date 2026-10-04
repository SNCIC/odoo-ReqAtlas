import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test-utils/create-test-app';
import { generateRequestId, INBOUND_REQUEST_ID_PATTERN, resolveRequestId } from './request-id.hook';

/** 契约 problem.json 的 pattern，刻意独立写一份，避免与被测常量同源而失效。 */
const PATTERN = /^req_[A-Za-z0-9_-]+$/;

describe('requestId 与契约对齐（problem.json `^req_[A-Za-z0-9_-]+$`）', () => {
  describe('纯函数 resolveRequestId', () => {
    it('生成态：连续 50 次均为 req_<32hex> 且匹配 pattern', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i += 1) {
        const id = generateRequestId();
        expect(id).toMatch(PATTERN);
        expect(id).toMatch(/^req_[0-9a-f]{32}$/);
        seen.add(id);
      }
      expect(seen.size).toBe(50);
    });

    it.each([
      'test-req-123',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      'a'.repeat(80),
      'req_abc def',
    ])('不合规入站 %s → 替换为新 req_*，并另记 inboundRequestId', (inbound) => {
      const resolved = resolveRequestId(inbound);
      expect(resolved.requestId).toMatch(PATTERN);
      expect(resolved.requestId).not.toBe(inbound);
      expect(resolved.inboundRequestId).toBe(inbound);
    });

    it('合规入站 req_abc123 → 原样复用', () => {
      expect(resolveRequestId('req_abc123')).toEqual({ requestId: 'req_abc123' });
    });

    it('边界：`req_` + 64 字符合规，+ 65 字符不合规', () => {
      expect(INBOUND_REQUEST_ID_PATTERN.test(`req_${'a'.repeat(64)}`)).toBe(true);
      expect(INBOUND_REQUEST_ID_PATTERN.test(`req_${'a'.repeat(65)}`)).toBe(false);
    });
  });

  describe('HTTP 集成（header 与 body 始终同值）', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('无入站头：响应头匹配 pattern 且 === meta.requestId', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
      const header = response.headers['x-request-id'];

      expect(header).toMatch(PATTERN);
      expect(response.json().meta.requestId).toBe(header);
    });

    it('合规入站头 req_abc123 被复用，响应头 === meta.requestId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { 'x-request-id': 'req_abc123' },
      });

      expect(response.headers['x-request-id']).toBe('req_abc123');
      expect(response.json().meta.requestId).toBe('req_abc123');
    });

    it('不合规入站头被替换：错误体 requestId === 响应头，且不等于入站原值', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant-context',
        headers: { 'x-request-id': 'test-req-123' },
      });

      expect(response.statusCode).toBe(400);
      const header = response.headers['x-request-id'];
      expect(header).toMatch(PATTERN);
      expect(header).not.toBe('test-req-123');
      expect(response.json().requestId).toBe(header);
    });

    it('不合规入站原值仅进入日志 inboundRequestId，绝不进入响应', async () => {
      const writes: string[] = [];
      const spy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: unknown): boolean => {
          writes.push(String(chunk));
          return true;
        });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { 'x-request-id': 'test-req-123' },
      });
      spy.mockRestore();

      const records = writes
        .map((line) => {
          try {
            return JSON.parse(line.trim()) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((record): record is Record<string, unknown> => record !== null);
      const hit = records.find((record) => record.inboundRequestId === 'test-req-123');

      expect(hit, '日志中应出现 inboundRequestId=test-req-123').toBeDefined();
      expect(hit?.requestId).toMatch(PATTERN);
      expect(response.headers['x-request-id']).not.toBe('test-req-123');
      expect(response.json().meta.requestId).not.toBe('test-req-123');
    });
  });
});
