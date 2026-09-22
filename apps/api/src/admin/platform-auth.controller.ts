import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginSchema, PasswordChangeSchema } from '@greenstate/contracts';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { validate } from '../common/http/validation.js';
import { AuthLimits } from '../identity/auth-limits.js';
import { SessionCookies } from '../identity/session-cookies.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformSessionGuard, type PlatformRequest } from './platform-session.guard.js';
@Controller('api/v1/admin/auth')
@UseGuards(CsrfGuard)
export class PlatformAuthController {
  constructor(@Inject(PlatformAuthService) private readonly auth: PlatformAuthService, @Inject(SessionCookies) private readonly cookies: SessionCookies, @Inject(AuthLimits) private readonly limits: AuthLimits) {}
  @Post('login') @HttpCode(200)
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = validate(LoginSchema, body); this.limits.login(req, res, 'platform', input.email);
    const result = await this.auth.login(input); this.cookies.issue(res, result.token); return result.principal;
  }
  @Get('me') @UseGuards(PlatformSessionGuard)
  me(@Req() req: PlatformRequest) { return req.principal; }
  @Post('password') @HttpCode(200) @UseGuards(PlatformSessionGuard)
  async password(@Req() req: PlatformRequest, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = validate(PasswordChangeSchema, body); this.limits.password(res, 'platform', req.principal.id);
    const result = await this.auth.password(req.sessionToken, input); this.cookies.issue(res, result.token); return result.principal;
  }
  @Post('logout') @HttpCode(204) @UseGuards(PlatformSessionGuard)
  async logout(@Req() req: PlatformRequest, @Res({ passthrough: true }) res: Response) { await this.auth.logout(req.sessionToken); this.cookies.clear(res); }
}
