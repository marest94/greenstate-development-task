import { Inject, Injectable } from '@nestjs/common';
import type { HostListingView, HostListingsPage, HostListingsQuery, ListingEdit, ListingWrite, TenantContext } from '@greenstate/contracts';
import type { Listing } from '../generated/prisma/client.js';
import { AppError } from '../common/http/errors.js';
import { HostListingsRepository, type HostListingRecord } from './host-listings.repository.js';
import { toListingDto } from './listing.mapper.js';
function toHostListing(row: HostListingRecord | Listing): HostListingView {
  return { ...toListingDto(row), description: row.description, version: row.version, archivedAt: row.archivedAt === null ? null : new Date(row.archivedAt).toISOString() };
}
@Injectable()
export class HostListingsService {
  constructor(@Inject(HostListingsRepository) private readonly repository: HostListingsRepository) {}
  async list(tenant: TenantContext, query: HostListingsQuery): Promise<HostListingsPage> {
    const result = await this.repository.list(tenant.id, query);
    return { ...result, items: result.items.map(toHostListing), page: query.page, pageSize: query.pageSize };
  }
  async detail(tenant: TenantContext, id: string) {
    const row = await this.repository.detail(tenant.id, id);
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
    return toHostListing(row);
  }
  async create(tenant: TenantContext, fields: ListingWrite) { return toHostListing(await this.repository.create(tenant.id, fields)); }
  async edit(tenant: TenantContext, id: string, input: ListingEdit) {
    const { version, ...fields } = input;
    return toHostListing(await this.repository.update(tenant.id, id, version, { fields }));
  }
  async archive(tenant: TenantContext, id: string, version: number, archived: boolean) {
    return toHostListing(await this.repository.update(tenant.id, id, version, { archived }));
  }
}
