import { Inject, Injectable } from '@nestjs/common';
import type { ListingSearch, ListingView, ListingPage, TenantContext } from '@greenstate/contracts';
import { Clock } from '../common/time/clock.js';
import { todayIn } from '../common/time/dates.js';
import { AppError } from '../common/http/errors.js';
import { ListingsRepository } from './listings.repository.js';
import { toListingDto } from './listing.mapper.js';
@Injectable()
export class ListingsService {
  constructor(@Inject(ListingsRepository) private readonly repository: ListingsRepository, @Inject(Clock) private readonly clock: Clock) {}
  async search(tenant: TenantContext, filters: ListingSearch): Promise<ListingPage> {
    const result = await this.repository.search(tenant.id, filters);
    return { ...result, items: result.items.map(toListingDto), page: filters.page, pageSize: filters.pageSize, today: todayIn(tenant.timezone, this.clock.now()) };
  }
  facets(tenant: TenantContext) { return this.repository.facets(tenant.id); }
  async detail(tenant: TenantContext, id: string): Promise<ListingView> {
    const row = await this.repository.detail(tenant.id, id);
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
    return { ...toListingDto(row), description: row.description, version: row.version };
  }
}
