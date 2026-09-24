import { PageTitle } from './PageTitle';
import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AuthNavigation } from '../features/auth/AuthNavigation';
export function AdminLayout() {
  const location = useLocation();
  return <div className="portal-shell">
    <PageTitle brand="GreenState Admin" basePath="/admin" />
    <a className="skip-link" href="#admin-content">Skip to content</a>
    <header className="portal-header"><Link className="wordmark" to="/">GreenState</Link><nav aria-label="Platform navigation"><AuthNavigation /></nav></header>
    <main id="admin-content" tabIndex={-1}>{location.state?.passwordChanged && <p className="host-success" role="status">Password changed successfully.</p>}<Suspense fallback={<p className="portal-loading" role="status">Loading page…</p>}><Outlet /></Suspense></main>
    <footer className="portal-footer"><span>GreenState platform administration</span><Link to="/">Rental portals</Link></footer>
  </div>;
}
