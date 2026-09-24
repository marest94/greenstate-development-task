import { afterAuthentication } from '../features/auth/auth-destination';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { useTenant } from './TenantProvider';
export function TenantAccountProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  return <AuthProvider scope={{ realm: 'tenant', tenantId: tenant.id, slug: tenant.slug }}>{children}</AuthProvider>;
}
export function ForcePasswordChange({ children }: { children: ReactNode }) {
  const auth = useAuth(); const location = useLocation();
  if (auth.principal?.mustChangePassword && location.pathname !== `${auth.basePath}/password`) return <Navigate to={afterAuthentication(auth.principal, auth.basePath, ['login', 'register'].includes(location.pathname.split('/').at(-1) ?? '') ? new URLSearchParams(location.search).get('returnTo') : `${location.pathname}${location.search}${location.hash}`)} replace />;
  return children;
}
