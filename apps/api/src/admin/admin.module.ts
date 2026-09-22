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
    return { module: AdminModule, controllers: [PlatformAuthController], providers: [{ provide: AdminDb, useValue: database }, PlatformAuthService, PlatformSessionsRepository, PlatformSessionGuard] };
  }
}
