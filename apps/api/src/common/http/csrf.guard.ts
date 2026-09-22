import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../../config.js';
import { APP_CONFIG } from './security-config.js';
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (req.get('Origin') !== this.config.appOrigin || req.get('X-Requested-By') !== 'greenstate-web') throw new ForbiddenException();
    return true;
  }
}
