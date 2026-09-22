import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@greenstate/contracts';
import { TenantDb } from '../db/tenant-db.js';
import { AppError } from '../common/http/errors.js';
@Controller('api/health')
export class HealthController {
  constructor(@Inject(TenantDb) private readonly db: TenantDb | null) {}
  @Get('live')
  live(): HealthResponse { return { status: 'ok' }; }
  @Get('ready')
  async ready(): Promise<HealthResponse> {
    try {
      if (!this.db) throw new Error('No database');
      await this.db.client.$queryRaw`SELECT 1 FROM tenants LIMIT 1`;
      return { status: 'ok' };
    } catch { throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The rental service is currently unavailable.'); }
  }
}
