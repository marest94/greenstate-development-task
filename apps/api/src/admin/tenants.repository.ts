import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AdminTenantsQuery, TenantCreate, TenantUpdate, TenantCounts } from '@greenstate/contracts';
import { Prisma, type Tenant } from '../generated/prisma/client.js';
import { AdminDb } from '../db/admin-db.js';
import { AppError } from '../common/http/errors.js';
export type AdminTenantRecord = Omit<Tenant, 'createdAt' | 'deletedAt'> & { createdAt: Date | string; deletedAt: Date | string | null };
const countsSql = Prisma.sql`jsonb_build_object(
  'activeListings', (SELECT count(*)::int FROM listings WHERE tenant_id = p.id AND archived_at IS NULL),
  'archivedListings', (SELECT count(*)::int FROM listings WHERE tenant_id = p.id AND archived_at IS NOT NULL),
  'accounts', (SELECT count(*)::int FROM tenant_users WHERE tenant_id = p.id),
  'enabledHosts', (SELECT count(*)::int FROM tenant_users WHERE tenant_id = p.id AND role = 'host' AND disabled_at IS NULL)
)`;
@Injectable()
export class AdminTenantsRepository {
  constructor(@Inject(AdminDb) private readonly database: AdminDb | null) {}
  private db() { if (!this.database) throw new ServiceUnavailableException(); return this.database; }
  list(query: AdminTenantsQuery) {
    const where: Prisma.Sql[] = [];
    if (query.status !== 'all') where.push(query.status === 'active' ? Prisma.sql`deleted_at IS NULL` : Prisma.sql`deleted_at IS NOT NULL`);
    if (query.search) where.push(Prisma.sql`position(${query.search.toLowerCase()} in lower(name || ' ' || slug)) > 0`);
    return this.db().transaction(async tx => {
      const [result] = await tx.$queryRaw<{ total: number; items: (AdminTenantRecord & { counts: TenantCounts })[] }[]>(Prisma.sql`WITH matching AS MATERIALIZED (
        SELECT id, slug, name, timezone, primary_color AS "primaryColor", contact_email AS "contactEmail", created_at AS "createdAt", deleted_at AS "deletedAt"
        FROM tenants ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty}
      ) SELECT (SELECT count(*)::int FROM matching) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('counts', ${countsSql})) FROM (SELECT * FROM matching ORDER BY name COLLATE "C", id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}) p), '[]'::jsonb) AS items`);
      return result!;
    });
  }
  summary(id: string) {
    return this.db().transaction(async tx => {
      const rows = await tx.$queryRaw<(AdminTenantRecord & { counts: TenantCounts })[]>(Prisma.sql`
        SELECT p.id, p.slug, p.name, p.timezone, p.primary_color AS "primaryColor", p.contact_email AS "contactEmail", p.created_at AS "createdAt", p.deleted_at AS "deletedAt", ${countsSql} AS counts
        FROM tenants p WHERE p.id = ${id}::uuid`);
      return rows[0] ?? null;
    });
  }
  detail(id: string) { return this.db().transaction(tx => tx.tenant.findUnique({ where: { id } })); }
  async create(input: TenantCreate) {
    try { return await this.db().transaction(tx => tx.tenant.create({ data: input })); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'TENANT_SLUG_EXISTS', 'This portal slug is already reserved. Choose another slug.');
      throw error;
    }
  }
  update(id: string, input: TenantUpdate) { return this.db().forTenant(id, 'exclusive', tx => tx.tenant.update({ where: { id }, data: input })); }
  remove(id: string, now: Date) {
    return this.db().forTenant(id, 'exclusive', async tx => {
      await tx.tenant.update({ where: { id }, data: { deletedAt: now } });
      await tx.tenantSession.deleteMany({ where: { tenantId: id } });
    });
  }
}
