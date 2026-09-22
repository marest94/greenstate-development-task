import { type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginSchema } from '@greenstate/contracts';
import { useAuth } from './AuthProvider';
import { AuthField, clearPasswords, FormFeedback, SessionStatus, useFormProblem, validationProblem } from './AuthForm';
import { safeReturnPath } from './safe-return-path';
export function LoginPage() {
  const auth = useAuth(); const location = useLocation(); const navigate = useNavigate(); const feedback = useFormProblem();
  const destination = safeReturnPath(new URLSearchParams(location.search).get('returnTo'), auth.basePath);
  if (auth.isLoading || auth.error) return <SessionStatus />;
  if (auth.principal) return <Navigate to={auth.principal.mustChangePassword ? `${auth.basePath}/password` : destination} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (auth.isLoading || auth.isPending) return;
    const form = event.currentTarget; const data = new FormData(form);
    const parsed = LoginSchema.safeParse({ email: data.get('email'), password: data.get('password') });
    if (!parsed.success) { feedback.report(validationProblem(parsed.error.issues)); return; }
    feedback.clear();
    try { const principal = await auth.login(parsed.data); clearPasswords(form); navigate(principal.mustChangePassword ? `${auth.basePath}/password` : destination, { replace: true }); }
    catch (error) { clearPasswords(form); feedback.report(error); }
  }
  return <section className="auth-card" aria-labelledby="login-heading"><p className="eyebrow">{auth.scope.realm === 'platform' ? 'Platform administration' : 'Welcome back'}</p>
    <h1 id="login-heading">Sign in</h1><p className="auth-intro">{auth.scope.realm === 'platform' ? 'Use your platform administrator account.' : 'Use your account for this rental portal.'}</p>
    <form noValidate onSubmit={event => { void submit(event); }} aria-busy={auth.isPending}>
      <AuthField name="email" label="Email" type="email" autoComplete="username" problem={feedback.problem} />
      <AuthField name="password" label="Password" type="password" autoComplete="current-password" problem={feedback.problem} />
      <FormFeedback problem={feedback.problem} /><button className="button-primary" disabled={auth.isPending} type="submit">Sign in</button>
      {auth.isPending && <p className="auth-hint" role="status">Signing in…</p>}
    </form>
    {auth.scope.realm === 'tenant' && <p className="auth-footer">New here? <Link to={`${auth.basePath}/register${location.search}`}>Create account</Link></p>}
  </section>;
}
