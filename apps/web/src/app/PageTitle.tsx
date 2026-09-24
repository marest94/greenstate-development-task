import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
function pageName(path: string, platform: boolean) {
  if (path === '' || path === '/') return platform ? 'Tenants' : 'Explore stays';
  const routes: [RegExp, string][] = [
    [/^\/login$/, 'Sign in'], [/^\/register$/, 'Create account'], [/^\/password$/, 'Change password'], [/^\/account$/, 'Account settings'], [/^\/saved$/, 'Saved stays'],
    [/^\/host(?:\/listings)?$/, 'Inventory'], [/^\/host\/calendar$/, 'Availability'], [/^\/host\/bookings$/, 'Bookings'], [/^\/host\/listings\/new$/, 'Create listing'], [/^\/host\/listings\/[^/]+\/calendar$/, 'Listing calendar'], [/^\/host\/listings\/[^/]+$/, 'Edit listing'],
    [/^\/listings\/[^/]+$/, 'Property details'], [/^\/tenants$/, 'Tenants'], [/^\/tenants\/new$/, 'Create tenant'], [/^\/tenants\/[^/]+\/accounts$/, 'Tenant accounts'], [/^\/tenants\/[^/]+$/, 'Manage tenant'],
  ];
  return routes.find(([pattern]) => pattern.test(path))?.[1] ?? 'Page not found';
}
export function PageTitle({ brand, basePath }: { brand: string; basePath: string }) {
  const { pathname } = useLocation();
  const page = basePath ? pageName(pathname.slice(basePath.length).replace(/\/$/, ''), basePath === '/admin') : 'Welcome';
  useEffect(() => { document.title = `${page} · ${brand}`; return () => { document.title = 'GreenState Stays'; }; }, [page, brand]);
  return null;
}
