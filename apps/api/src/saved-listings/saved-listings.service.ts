import { Inject, Injectable } from '@nestjs/common';
import type { SavedListingsPage, SavedListingsQuery } from '@greenstate/contracts';
import { toListingDto } from '../listings/listing.mapper.js';
import { SavedListingsRepository } from './saved-listings.repository.js';
@Injectable()
export class SavedListingsService {
  constructor(@Inject(SavedListingsRepository) private readonly repository: SavedListingsRepository) {}
  async list(tenantId: string, userId: string, query: SavedListingsQuery): Promise<SavedListingsPage> {
    const result = await this.repository.list(tenantId, userId, query);
    return { total: result.total, page: query.page, pageSize: query.pageSize, items: result.items.map(row => ({ listingId: row.listingId, savedAt: new Date(row.savedAt).toISOString(), listing: row.listing ? toListingDto(row.listing) : null })) };
  }
  put(tenantId: string, userId: string, listingId: string) { return this.repository.put(tenantId, userId, listingId); }
  remove(tenantId: string, userId: string, listingId: string) { return this.repository.remove(tenantId, userId, listingId); }
}
