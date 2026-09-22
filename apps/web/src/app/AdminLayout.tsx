import { Link, Outlet } from 'react-router-dom';
import { AuthNavigation } from '../features/auth/AuthNavigation';
export function AdminLayout() {
  return <div className="portal-shell">
    <a className="skip-link" href="#admin-content">Skip to content</a>
    <header className="portal-header"><Link className="wordmark" to="/">GreenState</Link><nav aria-label="Platform navigation"><AuthNavigation /></nav></header>
    <main id="admin-content" tabIndex={-1}><Outlet /></main>
    <footer className="portal-footer"><span>GreenState platform administration</span><Link to="/">Rental portals</Link></footer>
  </div>;
}
