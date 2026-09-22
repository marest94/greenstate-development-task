import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SavedListingsQuerySchema } from '@greenstate/contracts';
import { TenantGuard } from '../tenants/tenant.guard.js';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { validate } from '../common/http/validation.js';
import { SessionGuard, type AuthenticatedRequest } from '../identity/session.guard.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { SavedListingsService } from './saved-listings.service.js';
const Empty = z.strictObject({});
@Controller('api/v1/t/:slug/me/saved-listings')
@UseGuards(CsrfGuard, TenantGuard, SessionGuard, PermissionsGuard)
@RequirePermissions('saved-listings:manage')
export class SavedListingsController {
  constructor(@Inject(SavedListingsService) private readonly saved: SavedListingsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.saved.list(req.tenant.id, req.principal.id, validate(SavedListingsQuerySchema, query));
  }
  @Put(':listingId') @HttpCode(204)
  put(@Req() req: AuthenticatedRequest, @Param('listingId') id: unknown, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); validate(Empty, body ?? {});
    return this.saved.put(req.tenant.id, req.principal.id, validate(z.uuid(), id));
  }
  @Delete(':listingId') @HttpCode(204)
  remove(@Req() req: AuthenticatedRequest, @Param('listingId') id: unknown, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); validate(Empty, body ?? {});
    return this.saved.remove(req.tenant.id, req.principal.id, validate(z.uuid(), id));
  }
}
