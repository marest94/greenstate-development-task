import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { TenantContext } from '@greenstate/contracts';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../common/http/security-config.js';
import { SESSION_MS } from './session-token.js';
@Injectable()
export class SessionCookies {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  private scope(tenant?: TenantContext) {
    return { name: tenant ? `gs_t_${tenant.id}` : 'gs_platform', path: tenant ? `/api/v1/t/${tenant.slug}` : '/api/v1/admin' };
  }
  read(req: Request, tenant?: TenantContext): string {
    const { name } = this.scope(tenant);
    const values = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`)).map(part => part.slice(name.length + 1));
    if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0]!)) throw new UnauthorizedException();
    return values[0]!;
  }
  private options(tenant?: TenantContext): CookieOptions {
    return { path: this.scope(tenant).path, httpOnly: true, sameSite: 'lax', secure: this.config.appOrigin.startsWith('https:') };
  }
  issue(res: Response, token: string, tenant?: TenantContext) { res.cookie(this.scope(tenant).name, token, { ...this.options(tenant), maxAge: SESSION_MS }); }
  clear(res: Response, tenant?: TenantContext) { res.clearCookie(this.scope(tenant).name, this.options(tenant)); }
}
