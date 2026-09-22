import { Inject, Injectable } from '@nestjs/common';
import type { AdminTenant, AdminTenantsPage, AdminTenantsQuery, TenantCreate, TenantUpdate } from '@greenstate/contracts';
import { Clock } from '../common/time/clock.js';
import { AppError } from '../common/http/errors.js';
import { AdminTenantsRepository, type AdminTenantRecord } from './tenants.repository.js';
function toTenant(row: AdminTenantRecord): AdminTenant {
  return { id: row.id, slug: row.slug, name: row.name, timezone: row.timezone, primaryColor: row.primaryColor, contactEmail: row.contactEmail, currency: 'EUR', createdAt: new Date(row.createdAt).toISOString(), deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null };
}
@Injectable()
export class AdminTenantsService {
  constructor(@Inject(AdminTenantsRepository) private readonly repository: AdminTenantsRepository, @Inject(Clock) private readonly clock: Clock) {}
  async list(query: AdminTenantsQuery): Promise<AdminTenantsPage> { const result = await this.repository.list(query); return { ...result, items: result.items.map(row => ({ ...toTenant(row), counts: row.counts })), page: query.page, pageSize: query.pageSize }; }
  async summary(id: string) { const row = await this.repository.summary(id); if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.'); return { ...toTenant(row), counts: row.counts }; }
  async detail(id: string) { const row = await this.repository.detail(id); if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.'); return toTenant(row); }
  async create(input: TenantCreate) { return toTenant(await this.repository.create(input)); }
  async update(id: string, input: TenantUpdate) { return toTenant(await this.repository.update(id, input)); }
  remove(id: string) { return this.repository.remove(id, this.clock.now()); }
}
