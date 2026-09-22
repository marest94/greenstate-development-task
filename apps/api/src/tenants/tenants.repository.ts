import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '@greenstate/contracts';
import { TenantDb } from '../db/tenant-db.js';
import { AppError } from '../common/http/errors.js';
@Injectable()
export class TenantsRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb | null) {}
  async findLiveBySlug(slug: string): Promise<TenantContext | null> {
    if (!this.db) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The rental service is currently unavailable.');
    const tenant = await this.db.client.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, slug: true, name: true, timezone: true, primaryColor: true, contactEmail: true },
    });
    return tenant ? { ...tenant, currency: 'EUR' } : null;
  }
}
