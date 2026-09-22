import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { DatabaseModule } from './db/database.module.js';
import type { TenantDb } from './db/tenant-db.js';
import { TimeModule } from './common/time/time.module.js';
import { Clock } from './common/time/clock.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { ListingsModule } from './listings/listings.module.js';
@Module({})
export class AppModule {
  static register(database: TenantDb | null, clock: Clock): DynamicModule {
    return { module: AppModule, imports: [TimeModule.register(clock), DatabaseModule.register(database), TenantsModule, ListingsModule], controllers: [HealthController] };
  }
}
