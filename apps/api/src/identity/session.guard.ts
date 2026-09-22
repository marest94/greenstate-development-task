import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { TenantPrincipal } from '@greenstate/contracts';
import type { TenantRequest } from '../tenants/tenant.guard.js';
import { SessionCookies } from './session-cookies.js';
import { AuthService } from './auth.service.js';
export type AuthenticatedRequest = TenantRequest & { principal: TenantPrincipal; sessionToken: string };
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(SessionCookies) private readonly cookies: SessionCookies) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    req.sessionToken = this.cookies.read(req, req.tenant);
    req.principal = await this.auth.me(req.tenant.id, req.sessionToken); return true;
  }
}
