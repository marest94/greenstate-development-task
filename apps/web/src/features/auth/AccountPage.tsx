import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { SessionStatus, SignOutButton } from './AuthForm';
export function AccountPage() {
  const auth = useAuth();
  if (auth.isLoading || auth.error) return <SessionStatus />;
  if (!auth.principal) return <Navigate to={`${auth.basePath}/login`} replace />;
  if (auth.principal.mustChangePassword) return <Navigate to={`${auth.basePath}/password`} replace />;
  const role = { client: 'Client', host: 'Host', superadmin: 'Platform administrator' }[auth.principal.role];
  return <section className="auth-card" aria-labelledby="account-heading"><p className="eyebrow">{auth.scope.realm === 'platform' ? 'Platform administration' : 'Your portal account'}</p><h1 id="account-heading">Your account</h1>
    <dl className="auth-identity"><div><dt>Email</dt><dd>{auth.principal.email}</dd></div><div><dt>Account type</dt><dd>{role}</dd></div></dl>
    <p className="auth-intro">{auth.scope.realm === 'platform' ? 'This account is for platform administration.' : 'This account belongs to this rental portal.'}</p>
    <div className="auth-actions"><Link className="button-primary" to={`${auth.basePath}/password`}>Change password</Link><SignOutButton /></div>
    {auth.scope.realm === 'tenant' && <p className="auth-footer"><Link to={auth.basePath}>Explore stays</Link> · <Link to={`${auth.basePath}/saved`}>Saved listings</Link></p>}
  </section>;
}
