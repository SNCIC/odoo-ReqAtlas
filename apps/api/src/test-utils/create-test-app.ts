import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';

/**
 * 构建一个不绑定端口的 NestJS + Fastify 应用，供 `app.inject()` 契约测试使用。
 * 复用 `configureApp` 保证与 main.ts 行为一致（requestId、problem+json、日志）。
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
