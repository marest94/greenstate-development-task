import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { DatabaseModule } from './db/database.module.js';
import type { TenantDb } from './db/tenant-db.js';
import { TimeModule } from './common/time/time.module.js';
import { Clock } from './common/time/clock.js';
import { TenantsModule } from './tenants/tenants.module.js';
import type { AdminDb } from './db/admin-db.js';
import { AdminModule } from './admin/admin.module.js';
import type { AppConfig } from './config.js';
import type { SecurityConfig } from './common/http/security-config.js';
import { SecurityModule } from './common/http/security.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { SavedListingsModule } from './saved-listings/saved-listings.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { HostCalendarModule } from './availability/host-calendar.module.js';
import { ListingsModule } from './listings/listings.module.js';
@Module({})
export class AppModule {
  static register(database: TenantDb | null, privileged: AdminDb | null, clock: Clock, config: AppConfig, security: SecurityConfig): DynamicModule {
    return { module: AppModule, imports: [TimeModule.register(clock), SecurityModule.register(config, security), IdentityModule, AdminModule.register(privileged), DatabaseModule.register(database), TenantsModule, ListingsModule, SavedListingsModule, HostCalendarModule, BookingsModule], controllers: [HealthController] };
  }
}
