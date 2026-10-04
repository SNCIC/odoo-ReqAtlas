import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { TenantContextController } from './tenant/tenant-context.controller';

@Module({
  controllers: [HealthController, TenantContextController],
})
export class AppModule {}
