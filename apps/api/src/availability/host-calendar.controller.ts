import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AvailabilityQuerySchema, BlockWriteSchema, BlockRangeSchema } from '@greenstate/contracts';
import { validate } from '../common/http/validation.js';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { TenantGuard } from '../tenants/tenant.guard.js';
import { SessionGuard, type AuthenticatedRequest } from '../identity/session.guard.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { HostCalendarService } from './host-calendar.service.js';
const Empty = z.strictObject({});
@Controller('api/v1/t/:slug/host/listings/:id')
@UseGuards(CsrfGuard, TenantGuard, SessionGuard, PermissionsGuard)
@RequirePermissions('calendar:manage')
export class HostCalendarController {
  constructor(@Inject(HostCalendarService) private readonly service: HostCalendarService) {}
  @Get('calendar')
  calendar(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Query() query: unknown) { return this.service.calendar(request.tenant, validate(z.uuid(), id), validate(AvailabilityQuerySchema, query)); }
  @Post('blocks')
  create(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); return this.service.create(request.tenant, validate(z.uuid(), id), validate(BlockWriteSchema, body));
  }
  @Post('block-range')
  range(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); return this.service.range(request.tenant, validate(z.uuid(), id), validate(BlockRangeSchema, body));
  }
  @Delete('blocks/:blockId') @HttpCode(204)
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: unknown, @Param('blockId') blockId: unknown, @Query() query: unknown) {
    validate(Empty, query); return this.service.remove(request.tenant, validate(z.uuid(), id), validate(z.uuid(), blockId));
  }
}
