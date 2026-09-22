import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard, type TenantRequest } from './tenant.guard.js';
@Controller('api/v1/t/:slug')
@UseGuards(TenantGuard)
export class TenantsController {
  @Get()
  configuration(@Req() request: TenantRequest) { return request.tenant; }
}
