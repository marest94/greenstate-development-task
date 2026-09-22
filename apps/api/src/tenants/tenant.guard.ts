import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext } from '@greenstate/contracts';
import { TenantsService } from './tenants.service.js';
export type TenantRequest = Request & { tenant: TenantContext };
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(TenantsService) private readonly tenants: TenantsService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    request.tenant = await this.tenants.resolve(request.params.slug);
    return true;
  }
}
