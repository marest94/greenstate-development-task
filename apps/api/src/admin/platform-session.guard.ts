import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PlatformPrincipal } from '@greenstate/contracts';
import { SessionCookies } from '../identity/session-cookies.js';
import { PlatformAuthService } from './platform-auth.service.js';
export type PlatformRequest = Request & { principal: PlatformPrincipal; sessionToken: string };
@Injectable()
export class PlatformSessionGuard implements CanActivate {
  constructor(@Inject(PlatformAuthService) private readonly auth: PlatformAuthService, @Inject(SessionCookies) private readonly cookies: SessionCookies) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<PlatformRequest>(); req.sessionToken = this.cookies.read(req);
    req.principal = await this.auth.me(req.sessionToken); return true;
  }
}
