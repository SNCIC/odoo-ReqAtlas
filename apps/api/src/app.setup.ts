import type { INestApplication } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { registerRequestIdHook } from './common/request-id.hook';
import { registerRequestLoggingHook } from './common/request-logging.hook';

/**
 * 统一的启动配置。main.ts 与集成测试共用，保证测试环境与运行时行为一致。
 *
 * 注意：所有全局中间件以 Fastify hook 形式注册，避免依赖 @fastify/middie。
 */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ProblemDetailsFilter());

  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  registerRequestIdHook(fastify);
  registerRequestLoggingHook(fastify);

  return app;
}
