import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { BookingsQuerySchema } from '@greenstate/contracts';
import { validate } from '../common/http/validation.js';
import { TenantGuard } from '../tenants/tenant.guard.js';
import { SessionGuard, type AuthenticatedRequest } from '../identity/session.guard.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { BookingsService } from './bookings.service.js';
@Controller('api/v1/t/:slug/host/bookings')
@UseGuards(TenantGuard, SessionGuard, PermissionsGuard)
@RequirePermissions('bookings:read')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly service: BookingsService) {}
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.service.list(request.tenant, validate(BookingsQuerySchema, query)); }
}
