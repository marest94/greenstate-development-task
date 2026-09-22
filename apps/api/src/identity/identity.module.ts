import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { PermissionsGuard } from './permissions.guard.js';
import { SessionGuard } from './session.guard.js';
@Module({ imports: [TenantsModule], controllers: [AuthController], providers: [AuthService, SessionsRepository, SessionGuard, PermissionsGuard], exports: [AuthService, SessionGuard, PermissionsGuard] })
export class IdentityModule {}
