import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { DatabaseModule } from './db/database.module.js';
import type { TenantDb } from './db/tenant-db.js';
import { TenantsModule } from './tenants/tenants.module.js';
@Module({})
export class AppModule {
  static register(database: TenantDb | null): DynamicModule {
    return { module: AppModule, imports: [DatabaseModule.register(database), TenantsModule], controllers: [HealthController] };
  }
}
