import { AdminTenantsController } from './tenants.controller.js';
import { AdminTenantsService } from './tenants.service.js';
import { AdminTenantsRepository } from './tenants.repository.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import { Module, type DynamicModule } from '@nestjs/common';
import { AdminDb } from '../db/admin-db.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformSessionsRepository } from './platform-sessions.repository.js';
import { PlatformSessionGuard } from './platform-session.guard.js';
@Module({})
export class AdminModule {
  static register(database: AdminDb | null): DynamicModule {
    // The privileged pool is intentionally confined to administration and platform identity.
    return { module: AdminModule, controllers: [PlatformAuthController, AdminTenantsController, AccountsController], providers: [{ provide: AdminDb, useValue: database }, PlatformAuthService, PlatformSessionsRepository, PlatformSessionGuard, PermissionsGuard, AdminTenantsService, AdminTenantsRepository, AccountsService] };
  }
}
