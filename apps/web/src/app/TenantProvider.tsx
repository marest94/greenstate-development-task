import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { SlugSchema, TenantSchema, type TenantContext } from '@greenstate/contracts';
import { api, ApiProblem } from '../lib/api';
import { ErrorScreen } from './ErrorScreen';
import { isTemporaryQueryError, QueryRefreshWarning } from './QueryRefreshWarning';
const Tenant = createContext<TenantContext | null>(null);
export function TenantProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams();
  const valid = SlugSchema.safeParse(slug).success;
  const query = useQuery({ queryKey: ['tenant', slug], queryFn: () => api.get(`/t/${slug}`, undefined, TenantSchema), enabled: valid });
  if (!valid) return <ErrorScreen error={new ApiProblem({ status: 404, code: 'TENANT_NOT_FOUND', message: 'This rental portal was not found.', requestId: '' })} />;
  if (query.isPending) return <p className="portal-loading" role="status">Loading your rental portal…</p>;
  if (query.isError && (!query.data || !isTemporaryQueryError(query.error))) return <ErrorScreen error={query.error} onRetry={() => { void query.refetch(); }} />;
  return <Tenant.Provider key={query.data!.id} value={query.data!}><QueryRefreshWarning error={query.isError ? query.error : null} onRetry={() => { void query.refetch(); }} retrying={query.isFetching} />{children}</Tenant.Provider>;
}
export function useTenant(): TenantContext {
  const tenant = useContext(Tenant);
  if (!tenant) throw new Error('Tenant context is unavailable.');
  return tenant;
}
