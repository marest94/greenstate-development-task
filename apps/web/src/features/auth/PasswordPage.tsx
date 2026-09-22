import { type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PasswordChangeSchema } from '@greenstate/contracts';
import { useAuth } from './AuthProvider';
import { AuthField, clearPasswords, FormFeedback, SessionStatus, SignOutButton, useFormProblem, validationProblem } from './AuthForm';
export function PasswordPage() {
  const auth = useAuth(); const navigate = useNavigate(); const feedback = useFormProblem();
  if (auth.isLoading || auth.error) return <SessionStatus />;
  if (!auth.principal) return <Navigate to={`${auth.basePath}/login`} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (auth.isPending) return;
    const form = event.currentTarget; const data = new FormData(form);
    const parsed = PasswordChangeSchema.safeParse({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') });
    if (!parsed.success) { feedback.report(validationProblem(parsed.error.issues)); return; }
    feedback.clear();
    try { await auth.changePassword(parsed.data); clearPasswords(form); navigate(`${auth.basePath}/account`, { replace: true, state: { passwordChanged: true } }); }
    catch (error) { clearPasswords(form); feedback.report(error); }
  }
  return <section className="auth-card" aria-labelledby="password-heading"><p className="eyebrow">Account security</p><h1 id="password-heading">Change your password</h1>
    <p className="auth-intro">{auth.principal.mustChangePassword ? 'Set a new password before continuing. Enter the temporary password you received as your current password.' : 'Choose a new password for this account. Your other signed-in sessions will end.'}</p>
    <form noValidate onSubmit={event => { void submit(event); }} aria-busy={auth.isPending}>
      <AuthField name="currentPassword" label="Current password" type="password" autoComplete="current-password" problem={feedback.problem} />
      <AuthField name="newPassword" label="New password" type="password" autoComplete="new-password" hint="Use 15 to 128 characters, different from your current password." problem={feedback.problem} />
      <FormFeedback problem={feedback.problem} /><button className="button-primary" type="submit" disabled={auth.isPending}>Change password</button>
      {auth.isPending && <p className="auth-hint" role="status">Changing your password…</p>}
    </form>
    {auth.principal.mustChangePassword ? <p className="auth-footer">If you do not have your temporary password, sign out and contact your administrator.</p> : <p className="auth-footer"><Link to={`${auth.basePath}/account`}>Back to account</Link></p>}
    <SignOutButton />
  </section>;
}
