import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';
import { TenantsRepository } from './tenants.repository.js';
import { TenantGuard } from './tenant.guard.js';
@Module({ controllers: [TenantsController], providers: [TenantsService, TenantsRepository, TenantGuard], exports: [TenantGuard, TenantsService] })
export class TenantsModule {}
