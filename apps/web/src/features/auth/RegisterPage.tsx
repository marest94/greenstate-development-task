import { type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { RegisterSchema } from '@greenstate/contracts';
import { useAuth } from './AuthProvider';
import { AuthField, clearPasswords, FormFeedback, SessionStatus, useFormProblem, validationProblem } from './AuthForm';
import { safeReturnPath } from './safe-return-path';
export function RegisterPage() {
  const auth = useAuth(); const location = useLocation(); const navigate = useNavigate(); const feedback = useFormProblem();
  const destination = safeReturnPath(new URLSearchParams(location.search).get('returnTo'), auth.basePath);
  if (auth.scope.realm === 'platform') return <Navigate to={`${auth.basePath}/login`} replace />;
  if (auth.isLoading || auth.error) return <SessionStatus />;
  if (auth.principal) return <Navigate to={auth.principal.mustChangePassword ? `${auth.basePath}/password` : destination} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (auth.isLoading || auth.isPending) return;
    const form = event.currentTarget; const data = new FormData(form);
    const parsed = RegisterSchema.safeParse({ email: data.get('email'), password: data.get('password') });
    if (!parsed.success) { feedback.report(validationProblem(parsed.error.issues)); return; }
    feedback.clear();
    try { const principal = await auth.register(parsed.data); clearPasswords(form); navigate(principal.mustChangePassword ? `${auth.basePath}/password` : destination, { replace: true }); }
    catch (error) { clearPasswords(form); feedback.report(error); }
  }
  return <section className="auth-card" aria-labelledby="register-heading"><p className="eyebrow">Your portal account</p>
    <h1 id="register-heading">Create account</h1><p className="auth-intro">Your account belongs to this rental portal. You can explore stays without signing in.</p>
    <form noValidate onSubmit={event => { void submit(event); }} aria-busy={auth.isPending}>
      <AuthField name="email" label="Email" type="email" autoComplete="username" problem={feedback.problem} />
      <AuthField name="password" label="Password" type="password" autoComplete="new-password" hint="Use 15 to 128 characters. A long, unique passphrase works well." problem={feedback.problem} />
      <FormFeedback problem={feedback.problem} /><button className="button-primary" disabled={auth.isPending} type="submit">Create account</button>
      {auth.isPending && <p className="auth-hint" role="status">Creating your account…</p>}
    </form><p className="auth-footer">Already have an account? <Link to={`${auth.basePath}/login${location.search}`}>Sign in</Link></p>
  </section>;
}
