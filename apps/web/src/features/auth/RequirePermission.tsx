import { afterAuthentication } from './auth-destination';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { Permission } from '@greenstate/contracts';
import { useAuth } from './AuthProvider';
import { SessionStatus } from './AuthForm';
export function RequirePermission({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const auth = useAuth(); const location = useLocation();
  if (auth.isLoading || auth.error) return <SessionStatus />;
  if (!auth.principal) return <Navigate to={`${auth.basePath}/login?${new URLSearchParams({ returnTo: `${location.pathname}${location.search}${location.hash}` })}`} replace />;
  if (auth.principal.mustChangePassword) return <Navigate to={afterAuthentication(auth.principal, auth.basePath, `${location.pathname}${location.search}${location.hash}`)} replace />;
  if (permission && !auth.principal.permissions.includes(permission)) return <section className="auth-card"><h1>Access unavailable</h1><p role="alert">Your account does not have permission to view this page.</p><Link to={`${auth.basePath}/account`}>Back to account</Link></section>;
  return children;
}
