import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * 入站 `X-Request-Id` 的合规格式：总长 ≤ 69（`req_` + 1..64 个 `[A-Za-z0-9_-]`）。
 * 与契约 `docs/api/schemas/problem.json` 的 `^req_[A-Za-z0-9_-]+$` 一致。
 */
export const INBOUND_REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_-]{1,64}$/;

/** 生成态：固定 `req_<32 位小写 hex>`，匹配契约 pattern，且不受任何调用方控制。 */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export interface ResolvedRequestId {
  requestId: string;
  /**
   * 仅当入站值被拒绝替换时出现：调用方原始值，供日志追踪，
   * **绝不**回填进响应体或 `X-Request-Id`。
   */
  inboundRequestId?: string;
}

/**
 * 解析本次请求的 requestId。
 *
 * 为何**只有合规入站值才复用**、其余一律替换并另记：
 * (a) 入站值由调用方控制，直接回填响应就是契约违约（格式不匹配 `^req_[A-Za-z0-9_-]+$`）；
 * (b) 它会把任意调用方字符串注入我们的响应头与日志，构成日志伪造风险；
 * (c) 用日志字段 `inboundRequestId` 保留原值，追踪能力不丢，而我们的 `requestId` 始终受控。
 *
 * 合规入站值予以复用，是为保留跨跳（BFF → API）关联能力。
 */
export function resolveRequestId(inbound: string | undefined): ResolvedRequestId {
  if (typeof inbound === 'string' && INBOUND_REQUEST_ID_PATTERN.test(inbound)) {
    return { requestId: inbound };
  }
  const inboundRequestId = typeof inbound === 'string' && inbound.length > 0 ? inbound : undefined;
  return inboundRequestId
    ? { requestId: generateRequestId(), inboundRequestId }
    : { requestId: generateRequestId() };
}

interface RequestWithId {
  requestId?: string;
  inboundRequestId?: string;
  id?: string;
}

/** 全局请求 ID：合规入站头复用，否则生成 `req_*`；响应头与 body 始终用同一值。 */
export function registerRequestIdHook(app: FastifyInstance): void {
  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const incoming = request.headers[REQUEST_ID_HEADER];
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;
    const trimmed = typeof raw === 'string' ? raw.trim() : undefined;
    const inbound = trimmed && trimmed.length > 0 ? trimmed : undefined;

    const resolved = resolveRequestId(inbound);
    const target = request as FastifyRequest & RequestWithId;
    target.requestId = resolved.requestId;
    if (resolved.inboundRequestId) {
      target.inboundRequestId = resolved.inboundRequestId;
    }

    void reply.header(REQUEST_ID_HEADER, resolved.requestId);
    done();
  });
}

/** 从请求对象读取受控 requestId，供过滤器 / 控制器 / 日志使用。 */
export function getRequestId(request: unknown): string {
  const candidate = request as RequestWithId;
  return candidate.requestId ?? candidate.id ?? 'unknown';
}

/** 被拒绝的入站原值（若有），仅用于结构化日志。 */
export function getInboundRequestId(request: unknown): string | undefined {
  return (request as RequestWithId).inboundRequestId;
}
