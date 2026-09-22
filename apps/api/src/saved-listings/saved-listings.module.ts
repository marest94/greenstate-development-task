import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SavedListingsController } from './saved-listings.controller.js';
import { SavedListingsService } from './saved-listings.service.js';
import { SavedListingsRepository } from './saved-listings.repository.js';
@Module({ imports: [TenantsModule, IdentityModule], controllers: [SavedListingsController], providers: [SavedListingsService, SavedListingsRepository] })
export class SavedListingsModule {}
