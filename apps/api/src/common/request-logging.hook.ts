import { createJsonLogger, type LogLevel } from '@reqatlas/observability';
import type { FastifyInstance } from 'fastify';
import { getInboundRequestId, getRequestId } from './request-id.hook';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function resolveLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  return raw && (LEVELS as readonly string[]).includes(raw) ? (raw as LogLevel) : 'info';
}

/**
 * 结构化访问日志：一行一个 JSON，含 requestId / 耗时 / 状态码，脱敏由日志器保证。
 * 当入站 `X-Request-Id` 因不合规被替换时，原值以 `inboundRequestId` 字段记录（仅日志，不进响应）。
 */
export function registerRequestLoggingHook(app: FastifyInstance, service = 'api'): void {
  const logger = createJsonLogger({ service, level: resolveLevel() });

  app.addHook('onResponse', (request, reply, done) => {
    const inboundRequestId = getInboundRequestId(request);
    logger.info('http_request', {
      requestId: getRequestId(request),
      ...(inboundRequestId ? { inboundRequestId } : {}),
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    });
    done();
  });
}
