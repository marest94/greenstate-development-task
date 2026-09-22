import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import './auth.css';
export function AuthNavigation() {
  const auth = useAuth();
  if (auth.isLoading) return <span className="auth-nav-loading">Account…</span>;
  if (auth.principal) return <>{auth.scope.realm === 'tenant' && !auth.principal.mustChangePassword && <NavLink className="auth-nav-link" to={`${auth.basePath}/saved`}>Saved listings</NavLink>}<NavLink className="auth-nav-link" to={`${auth.basePath}/account`}>Account</NavLink></>;
  return <><NavLink className="auth-nav-link" to={`${auth.basePath}/login`}>Sign in</NavLink>{auth.scope.realm === 'tenant' && <NavLink className="auth-nav-link" to={`${auth.basePath}/register`}>Create account</NavLink>}</>;
}
