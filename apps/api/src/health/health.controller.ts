import { Controller, Get, Req } from '@nestjs/common';
import type { ApiResponse, HealthPayload } from '@reqatlas/contracts';
import { getRequestId } from '../common/request-id.hook';

const SERVICE_NAME = '@reqatlas/api';
const SERVICE_VERSION = '0.0.0';
const STARTED_AT = Date.now();

@Controller('v1/health')
export class HealthController {
  @Get()
  getHealth(@Req() request: unknown): ApiResponse<HealthPayload> {
    return {
      data: {
        status: 'ok',
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      },
      meta: { requestId: getRequestId(request) },
    };
  }
}
