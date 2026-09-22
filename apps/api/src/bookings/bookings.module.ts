import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsRepository } from './bookings.repository.js';
import { BookingsService } from './bookings.service.js';
@Module({ imports: [TenantsModule, IdentityModule], controllers: [BookingsController], providers: [BookingsRepository, BookingsService] })
export class BookingsModule {}
