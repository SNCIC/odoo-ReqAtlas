import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ApiResponse } from '@reqatlas/contracts';
import { getRequestId } from '../common/request-id.hook';
import { TenantContextGuard, type TenantContext } from '../common/tenant-context';

interface TenantRequest {
  tenant?: TenantContext;
}

/**
 * 租户上下文探针接口（M1-04）。
 * 用于证明 tenant context 从请求头提取、缺省被拒绝，且 requestId 贯穿响应。
 */
@Controller('v1/tenant-context')
@UseGuards(TenantContextGuard)
export class TenantContextController {
  @Get()
  current(@Req() request: TenantRequest): ApiResponse<TenantContext> {
    return {
      data: request.tenant ?? { tenantId: '' },
      meta: { requestId: getRequestId(request) },
    };
  }
}
