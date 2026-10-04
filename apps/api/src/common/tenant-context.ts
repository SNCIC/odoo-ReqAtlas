import { HttpException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@reqatlas/contracts';

export const TENANT_HEADER = 'x-tenant-id';

/** 请求级租户上下文。M1 仅做提取与拒绝，不做真实鉴权。 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
}

/** 从请求头提取租户上下文；缺失返回 null（由调用方决定拒绝策略）。 */
export function resolveTenantContext(headers: Record<string, unknown>): TenantContext | null {
  const raw = headers[TENANT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return { tenantId: value.trim() };
}

/**
 * 租户上下文守卫：缺省直接拒绝（400 `VALIDATION_FAILED`）。
 * 仅挂在需要租户范围的接口上；健康检查不挂，保持开放。
 *
 * 为何用 `VALIDATION_FAILED`(400) 而非 `AUTH_REQUIRED`(401)：
 * - 缺少一个必需请求头属于**请求不完整**，即字段级校验失败；其客户端动作
 *   「定位字段/规则，不重试原请求」正好匹配。
 * - 用 `AUTH_REQUIRED`(401) 会**误导客户端去重新登录**，而重新登录并不能补上这个头。
 * - 用 `PERMISSION_DENIED`(403) 也不对：我们不是判定调用者无权，而是缺少作用域信息。
 *
 * 深层设计（租户最终来自**请求头**还是 BFF 会话，见实施方案 §7.1）另走 OQ，本阶段保留头实现。
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const tenant = resolveTenantContext(request.headers);
    if (!tenant) {
      throw new HttpException(
        {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: `Missing required header: ${TENANT_HEADER}`,
          context: { field: TENANT_HEADER },
        },
        400,
      );
    }
    (request as { tenant?: TenantContext }).tenant = tenant;
    return true;
  }
}
