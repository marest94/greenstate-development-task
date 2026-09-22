import { useQuery } from '@tanstack/react-query';
import { AdminTenantSummarySchema, type AdminTenant } from '@greenstate/contracts';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { tenantsApi } from './shared';
export function TenantSetupChecklist({ tenant }: { tenant: AdminTenant }) {
  const auth = useAuth();
  const query = useQuery({ queryKey: [...auth.privateKey!, 'admin-tenant-summary', tenant.id], queryFn: ({ signal }) => api.get(`${tenantsApi}/${tenant.id}/summary`, undefined, AdminTenantSummarySchema, signal) });
  if (query.isPending) return <p role="status">Loading tenant setup…</p>;
  if (query.isError) return <p role="status">Setup summary unavailable. <button className="button-secondary" onClick={() => { void query.refetch(); }}>Retry summary</button></p>;
  const counts = query.data.counts;
  return <section className="tenant-setup" aria-labelledby="setup-heading"><div><p className="eyebrow">Tenant overview</p><h2 id="setup-heading">{tenant.deletedAt ? 'Retained records' : 'Setup progress'}</h2></div>
    <div className="tenant-metrics"><p><strong>{counts.activeListings}</strong>Active listings</p><p><strong>{counts.archivedListings}</strong>Archived listings</p><p><strong>{counts.accounts}</strong>Accounts</p><p><strong>{counts.enabledHosts}</strong>Enabled hosts</p></div>
    {tenant.deletedAt ? <p>Tenant access is disabled. Records are retained.</p> : <><ol className="setup-steps"><li><span>✓</span><div><strong>Tenant created</strong><p>Portal address and business time zone configured.</p></div></li><li><span>{counts.enabledHosts ? '✓' : '2'}</span><div><strong>{counts.enabledHosts ? 'Host access ready' : 'Add an enabled host'}</strong><p><Link to={`/admin/tenants/${tenant.id}/accounts`}>Manage host accounts</Link></p></div></li><li><span>{counts.activeListings ? '✓' : '3'}</span><div><strong>{counts.activeListings ? 'Properties published' : 'Publish the first property'}</strong><p>An enabled host creates listings in the tenant’s host workspace.</p><Link to={`/${tenant.slug}`}>Open public portal</Link></div></li></ol></>}
  </section>;
}
