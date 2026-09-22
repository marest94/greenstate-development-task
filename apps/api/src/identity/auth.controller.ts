import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { LoginSchema, PasswordChangeSchema, RegisterSchema } from '@greenstate/contracts';
import { TenantGuard, type TenantRequest } from '../tenants/tenant.guard.js';
import { CsrfGuard } from '../common/http/csrf.guard.js';
import { validate } from '../common/http/validation.js';
import { AuthService } from './auth.service.js';
import { AuthLimits } from './auth-limits.js';
import { SessionCookies } from './session-cookies.js';
import { SessionGuard, type AuthenticatedRequest } from './session.guard.js';
@Controller('api/v1/t/:slug/auth')
@UseGuards(CsrfGuard, TenantGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(SessionCookies) private readonly cookies: SessionCookies, @Inject(AuthLimits) private readonly limits: AuthLimits) {}
  @Post('register')
  async register(@Req() req: TenantRequest, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = validate(RegisterSchema, body); this.limits.register(req, res);
    const result = await this.auth.register(req.tenant.id, input); this.cookies.issue(res, result.token, req.tenant); return result.principal;
  }
  @Post('login') @HttpCode(200)
  async login(@Req() req: TenantRequest, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = validate(LoginSchema, body); this.limits.login(req, res, req.tenant.id, input.email);
    const result = await this.auth.login(req.tenant.id, input); this.cookies.issue(res, result.token, req.tenant); return result.principal;
  }
  @Get('me') @UseGuards(SessionGuard)
  me(@Req() req: AuthenticatedRequest) { return req.principal; }
  @Post('password') @HttpCode(200) @UseGuards(SessionGuard)
  async password(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = validate(PasswordChangeSchema, body); this.limits.password(res, req.tenant.id, req.principal.id);
    const result = await this.auth.password(req.tenant.id, req.sessionToken, input); this.cookies.issue(res, result.token, req.tenant); return result.principal;
  }
  @Post('logout') @HttpCode(204) @UseGuards(SessionGuard)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.tenant.id, req.sessionToken); this.cookies.clear(res, req.tenant);
  }
}
