import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { HostCalendarController } from './host-calendar.controller.js';
import { HostCalendarRepository } from './host-calendar.repository.js';
import { HostCalendarService } from './host-calendar.service.js';
@Module({ imports: [TenantsModule, IdentityModule], controllers: [HostCalendarController], providers: [HostCalendarRepository, HostCalendarService] })
export class HostCalendarModule {}
