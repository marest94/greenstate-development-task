import { Global, Module, type DynamicModule } from '@nestjs/common';
import { TenantDb } from './tenant-db.js';
@Global()
@Module({})
export class DatabaseModule {
  static register(database: TenantDb | null): DynamicModule {
    return { module: DatabaseModule, providers: [{ provide: TenantDb, useValue: database }], exports: [TenantDb] };
  }
}
