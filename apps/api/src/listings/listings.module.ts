import { IdentityModule } from '../identity/identity.module.js';
import { HostListingsController } from './host-listings.controller.js';
import { HostListingsRepository } from './host-listings.repository.js';
import { HostListingsService } from './host-listings.service.js';
import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { ListingsRepository } from './listings.repository.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { AvailabilityRepository } from '../availability/availability.repository.js';
@Module({ imports: [TenantsModule, IdentityModule], controllers: [ListingsController, HostListingsController], providers: [HostListingsService, HostListingsRepository, ListingsService, ListingsRepository, AvailabilityService, AvailabilityRepository] })
export class ListingsModule {}
