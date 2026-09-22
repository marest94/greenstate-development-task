import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter, parserErrors } from './common/http/errors.js';
import { requestMetadata, type RequestLog } from './common/http/request-id.js';

export async function createApp(options: { log?: (record: RequestLog) => void } = {}) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
  app.disable('x-powered-by');
  app.use(requestMetadata(options.log ?? ((record) => process.stdout.write(`${JSON.stringify(record)}\n`))));
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.use(parserErrors);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
