import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ListingSearchSchema, AvailabilityQuerySchema } from '@greenstate/contracts';
import { validate } from '../common/http/validation.js';
import { TenantGuard, type TenantRequest } from '../tenants/tenant.guard.js';
import { ListingsService } from './listings.service.js';
import { AvailabilityService } from '../availability/availability.service.js';
const EmptyQuery = z.strictObject({});
@Controller('api/v1/t/:slug/listings')
@UseGuards(TenantGuard)
export class ListingsController {
  constructor(@Inject(ListingsService) private readonly listings: ListingsService, @Inject(AvailabilityService) private readonly availability: AvailabilityService) {}
  @Get()
  search(@Req() request: TenantRequest, @Query() query: unknown) { return this.listings.search(request.tenant, validate(ListingSearchSchema, query)); }
  @Get('facets')
  facets(@Req() request: TenantRequest, @Query() query: unknown) { validate(EmptyQuery, query); return this.listings.facets(request.tenant); }
  @Get(':id')
  detail(@Req() request: TenantRequest, @Param('id') id: unknown, @Query() query: unknown) {
    validate(EmptyQuery, query); return this.listings.detail(request.tenant, validate(z.uuid(), id));
  }
  @Get(':id/availability')
  calendar(@Req() request: TenantRequest, @Param('id') id: unknown, @Query() query: unknown) {
    return this.availability.calendar(request.tenant, validate(z.uuid(), id), validate(AvailabilityQuerySchema, query));
  }
}
