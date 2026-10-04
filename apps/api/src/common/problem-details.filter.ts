import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { type ErrorCode, isErrorCode, type ProblemDetails } from '@reqatlas/contracts';
import type { FastifyReply } from 'fastify';
import { getRequestId } from './request-id.hook';
import { type ApiErrorCode, defaultCodeForStatus } from './status-code-map';

interface NestedProblem {
  code?: unknown;
  message?: unknown;
  context?: unknown;
}

/**
 * 全局异常过滤器：统一输出 application/problem+json 与稳定 `code`。
 *
 * code 解析优先级：
 * 1. HttpException 响应对象里**显式且合法**的 `code`（对照权威枚举校验）；
 * 2. `status-code-map.ts` 的显式 `status → code` 映射表；
 * 3. 都命中不了 → **显式抛错**，绝不静默造码（禁止 `HTTP_${status}` 这类任意值）。
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = getRequestId(host.switchToHttp().getRequest<unknown>());
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const code = this.resolveCode(exception, status);

    const body: ProblemDetails = {
      type: `https://reqatlas.example/problems/${code.toLowerCase()}`,
      title: exception instanceof HttpException ? exception.message : 'Internal Server Error',
      status,
      code,
      requestId,
    };

    const detail = this.resolveDetail(exception);
    if (detail) {
      body.detail = detail;
    }
    const context = this.resolveContext(exception);
    if (context) {
      body.context = context;
    }

    void reply.status(status).type('application/problem+json').send(JSON.stringify(body));
  }

  private resolveCode(exception: unknown, status: number): ApiErrorCode {
    const explicit = this.explicitCode(exception);
    if (explicit) {
      return explicit;
    }
    const mapped = defaultCodeForStatus(status);
    if (mapped) {
      return mapped;
    }
    // 不静默造码：无法映射时显式失败，由 problem-details.filter.spec.ts 的覆盖性测试保证不可达。
    throw new Error(
      `problem+json: no stable error code mapped for HTTP ${status}. ` +
        `Register it in apps/api/src/common/status-code-map.ts (do not invent a code). ` +
        `Authoritative enum: docs/api/schemas/error-code.json.`,
    );
  }

  /** 仅接受权威枚举内的显式 code；非法值（如任意字符串）一律忽略并走状态映射。 */
  private explicitCode(exception: unknown): ErrorCode | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }
    const response = exception.getResponse();
    if (response && typeof response === 'object') {
      const code = (response as NestedProblem).code;
      if (isErrorCode(code)) {
        return code;
      }
    }
    return undefined;
  }

  private resolveDetail(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const message = (response as NestedProblem).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.map(String).join(', ');
    }
    return undefined;
  }

  private resolveContext(exception: unknown): Record<string, unknown> | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }
    const response = exception.getResponse();
    if (response && typeof response === 'object') {
      const context = (response as NestedProblem).context;
      if (context && typeof context === 'object' && !Array.isArray(context)) {
        return context as Record<string, unknown>;
      }
    }
    return undefined;
  }
}
