import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { PortfolioCalendarQuerySchema } from '@greenstate/contracts';
import { validate } from '../common/http/validation.js';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { TenantGuard } from '../tenants/tenant.guard.js';
import { SessionGuard, type AuthenticatedRequest } from '../identity/session.guard.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { PortfolioCalendarRepository } from './portfolio-calendar.repository.js';
@Controller('api/v1/t/:slug/host/calendar')
@UseGuards(CsrfGuard, TenantGuard, SessionGuard, PermissionsGuard)
@RequirePermissions('calendar:manage')
export class PortfolioCalendarController {
  constructor(@Inject(PortfolioCalendarRepository) private readonly repository: PortfolioCalendarRepository) {}
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.repository.list(request.tenant, validate(PortfolioCalendarQuerySchema, query)); }
}
