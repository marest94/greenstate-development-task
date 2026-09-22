import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AccountResetSchema, AccountsQuerySchema, HostCreateSchema } from '@greenstate/contracts';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { validate } from '../common/http/validation.js';
import { AuthLimits } from '../identity/auth-limits.js';
import { PermissionsGuard, RequirePermissions } from '../identity/permissions.guard.js';
import { PlatformSessionGuard, type PlatformRequest } from './platform-session.guard.js';
import { AccountsService } from './accounts.service.js';
const Empty = z.strictObject({});
@Controller('api/v1/admin/tenants/:tenantId')
@UseGuards(CsrfGuard, PlatformSessionGuard, PermissionsGuard)
@RequirePermissions('accounts:manage')
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly service: AccountsService, @Inject(AuthLimits) private readonly limits: AuthLimits) {}
  @Get('accounts') list(@Param('tenantId') id: unknown, @Query() query: unknown) { return this.service.list(validate(z.uuid(), id), validate(AccountsQuerySchema, query)); }
  @Post('hosts')
  create(@Param('tenantId') id: unknown, @Req() req: PlatformRequest, @Res({ passthrough: true }) res: Response, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); const tenantId = validate(z.uuid(), id); const input = validate(HostCreateSchema, body);
    this.limits.password(res, 'platform', req.principal.id, `${tenantId.toLowerCase()}:${input.email}`);
    return this.service.createHost(tenantId, input);
  }
  @Post('accounts/:userId/disable') @HttpCode(204)
  disable(@Param('tenantId') id: unknown, @Param('userId') userId: unknown, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); validate(Empty, body ?? {}); return this.service.setDisabled(validate(z.uuid(), id), validate(z.uuid(), userId), true);
  }
  @Post('accounts/:userId/enable') @HttpCode(204)
  enable(@Param('tenantId') id: unknown, @Param('userId') userId: unknown, @Query() query: unknown, @Body() body: unknown) {
    validate(Empty, query); validate(Empty, body ?? {}); return this.service.setDisabled(validate(z.uuid(), id), validate(z.uuid(), userId), false);
  }
  @Post('accounts/:userId/password-reset') @HttpCode(204)
  reset(@Param('tenantId') id: unknown, @Param('userId') user: unknown, @Req() req: PlatformRequest, @Res({ passthrough: true }) res: Response, @Query() query: unknown, @Body() body: unknown) { return this.credentials(id, user, req, res, query, body, false); }
  @Post('accounts/:userId/promote-host') @HttpCode(204)
  promote(@Param('tenantId') id: unknown, @Param('userId') user: unknown, @Req() req: PlatformRequest, @Res({ passthrough: true }) res: Response, @Query() query: unknown, @Body() body: unknown) { return this.credentials(id, user, req, res, query, body, true); }
  private credentials(id: unknown, user: unknown, req: PlatformRequest, res: Response, query: unknown, body: unknown, promote: boolean) {
    validate(Empty, query); const tenantId = validate(z.uuid(), id); const userId = validate(z.uuid(), user); const input = validate(AccountResetSchema, body);
    this.limits.password(res, 'platform', req.principal.id, `${tenantId.toLowerCase()}:${userId.toLowerCase()}`);
    return this.service.reset(tenantId, userId, input.temporaryPassword, promote);
  }
}
