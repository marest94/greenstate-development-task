import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { HostListingsQuerySchema, ListingEditSchema, ListingVersionSchema, ListingWriteSchema } from '@greenstate/contracts';
import { validate } from '../common/http/validation.js';
import { TenantGuard } from '../tenants/tenant.guard.js';
import { SessionGuard, type AuthenticatedRequest } from '../identity/session.guard.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { HostListingsService } from './host-listings.service.js';
const EmptyQuery = z.strictObject({});
@Controller('api/v1/t/:slug/host/listings')
@UseGuards(CsrfGuard, TenantGuard, SessionGuard, PermissionsGuard)
@RequirePermissions('listings:manage')
export class HostListingsController {
  constructor(@Inject(HostListingsService) private readonly service: HostListingsService) {}
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.service.list(request.tenant, validate(HostListingsQuerySchema, query)); }
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Query() query: unknown) {
    validate(EmptyQuery, query); return this.service.create(request.tenant, validate(ListingWriteSchema, body));
  }
  @Get(':id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Query() query: unknown) {
    validate(EmptyQuery, query); return this.service.detail(request.tenant, validate(z.uuid(), id));
  }
  @Patch(':id')
  edit(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Body() body: unknown, @Query() query: unknown) {
    validate(EmptyQuery, query); return this.service.edit(request.tenant, validate(z.uuid(), id), validate(ListingEditSchema, body));
  }
  @Post(':id/archive') @HttpCode(200)
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Body() body: unknown, @Query() query: unknown) {
    validate(EmptyQuery, query); return this.service.archive(request.tenant, validate(z.uuid(), id), validate(ListingVersionSchema, body).version, true);
  }
  @Post(':id/restore') @HttpCode(200)
  restore(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Body() body: unknown, @Query() query: unknown) {
    validate(EmptyQuery, query); return this.service.archive(request.tenant, validate(z.uuid(), id), validate(ListingVersionSchema, body).version, false);
  }
}
