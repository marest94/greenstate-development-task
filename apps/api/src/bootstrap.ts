import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { loadDatabaseConfig, type DatabaseConfig } from './config.js';
import { TenantDb } from './db/tenant-db.js';
import { AdminDb } from './db/admin-db.js';
import { assertRuntimeRole } from './db/role-check.js';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter, parserErrors } from './common/http/errors.js';
import { requestMetadata, type RequestLog } from './common/http/request-id.js';

export async function createApp(options: { log?: (record: RequestLog) => void; database?: DatabaseConfig | false } = {}) {
  let database: TenantDb | null = null;
  if (options.database !== false) {
    const config = options.database ?? loadDatabaseConfig();
    database = new TenantDb(config.ordinaryUrl);
    const privileged = new AdminDb(config.privilegedUrl);
    try {
      await assertRuntimeRole(database.client, 'ordinary');
      await assertRuntimeRole(privileged.client, 'privileged');
    } catch (error) { await database.onApplicationShutdown(); throw error; }
    finally { await privileged.close(); }
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(database), { bodyParser: false, logger: false });
  app.disable('x-powered-by');
  app.use(requestMetadata(options.log ?? ((record) => process.stdout.write(`${JSON.stringify(record)}\n`))));
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.use(parserErrors);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
