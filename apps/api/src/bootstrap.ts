import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { Clock } from './common/time/clock.js';
import { loadConfig, loadDatabaseConfig, type AppConfig, type DatabaseConfig } from './config.js';
import { TenantDb } from './db/tenant-db.js';
import { AdminDb } from './db/admin-db.js';
import { assertRuntimeRole } from './db/role-check.js';
import { loadSecurityConfig, type SecurityConfig } from './common/http/security-config.js';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter, parserErrors } from './common/http/errors.js';
import { requestMetadata, type RequestLog } from './common/http/request-id.js';

export async function createApp(options: { log?: (record: RequestLog) => void; database?: DatabaseConfig | false; clock?: Clock; config?: AppConfig; security?: SecurityConfig } = {}) {
  const config = options.config ?? loadConfig();
  const security = options.security ?? loadSecurityConfig();
  let database: TenantDb | null = null;
  let privileged: AdminDb | null = null;
  if (options.database !== false) {
    const config = options.database ?? loadDatabaseConfig();
    database = new TenantDb(config.ordinaryUrl);
    privileged = new AdminDb(config.privilegedUrl);
    try {
      await assertRuntimeRole(database.client, 'ordinary');
      await assertRuntimeRole(privileged.client, 'privileged');
    } catch (error) { await Promise.all([database.onApplicationShutdown(), privileged.close()]); throw error; }
  }
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule.register(database, privileged, options.clock ?? new Clock(), config, security), { bodyParser: false, logger: false, abortOnError: false });
    app.disable('x-powered-by');
    app.set('trust proxy', security.trustProxyHops);
    const writeLog = options.log ?? ((record: RequestLog) => { process.stdout.write(`${JSON.stringify(record)}\n`); });
    const log = (record: RequestLog) => {
      // Logging failures must never replace an API response or become an unhandled rejection.
      try { void Promise.resolve(writeLog(record)).catch(() => {}); } catch { /* Keep the HTTP boundary available. */ }
    };
    app.use(requestMetadata(log));
    app.use(helmet());
    app.use('/api', (_req: express.Request, res: express.Response, next: express.NextFunction) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    app.use(express.json({ limit: '32kb' }));
    app.use(parserErrors);
    app.useGlobalFilters(new ApiExceptionFilter(log));
    app.enableShutdownHooks();
    return app;
  } catch (error) { await Promise.all([database?.onApplicationShutdown(), privileged?.close()]); throw error; }
}
