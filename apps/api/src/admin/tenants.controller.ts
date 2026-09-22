import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminTenantsQuerySchema, TenantCreateSchema, TenantUpdateSchema } from '@greenstate/contracts';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { validate } from '../common/http/validation.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { PlatformSessionGuard } from './platform-session.guard.js';
import { AdminTenantsService } from './tenants.service.js';
const Empty = z.strictObject({});
@Controller('api/v1/admin/tenants')
@UseGuards(CsrfGuard, PlatformSessionGuard, PermissionsGuard)
@RequirePermissions('tenants:manage')
export class AdminTenantsController {
  constructor(@Inject(AdminTenantsService) private readonly service: AdminTenantsService) {}
  @Get() list(@Query() query: unknown) { return this.service.list(validate(AdminTenantsQuerySchema, query)); }
  @Get(':id/summary') summary(@Param('id') id: unknown, @Query() query: unknown) { validate(Empty, query); return this.service.summary(validate(z.uuid(), id)); }
  @Get(':id') detail(@Param('id') id: unknown, @Query() query: unknown) { validate(Empty, query); return this.service.detail(validate(z.uuid(), id)); }
  @Post() create(@Body() body: unknown, @Query() query: unknown) { validate(Empty, query); return this.service.create(validate(TenantCreateSchema, body)); }
  @Patch(':id') update(@Param('id') id: unknown, @Body() body: unknown, @Query() query: unknown) { validate(Empty, query); return this.service.update(validate(z.uuid(), id), validate(TenantUpdateSchema, body)); }
  @Delete(':id') @HttpCode(204)
  remove(@Param('id') id: unknown, @Body() body: unknown, @Query() query: unknown) { validate(Empty, query); validate(Empty, body ?? {}); return this.service.remove(validate(z.uuid(), id)); }
}
