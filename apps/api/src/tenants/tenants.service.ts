import { Inject, Injectable } from '@nestjs/common';
import { SlugSchema } from '@greenstate/contracts';
import { validate } from '../common/http/validation.js';
import { AppError } from '../common/http/errors.js';
import { TenantsRepository } from './tenants.repository.js';
@Injectable()
export class TenantsService {
  constructor(@Inject(TenantsRepository) private readonly repository: TenantsRepository) {}
  async resolve(slug: unknown) {
    const tenant = await this.repository.findLiveBySlug(validate(SlugSchema, slug));
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'This rental portal was not found.');
    return tenant;
  }
}
