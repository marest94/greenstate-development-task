import { useEffect, useRef, useState, type HTMLInputAutoCompleteAttribute } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiProblem } from '../../lib/api';
import { useAuth } from './AuthProvider';
import './auth.css';
export function validationProblem(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) (fields[String(issue.path[0] ?? '')] ??= []).push(issue.message);
  return new ApiProblem({ status: 400, code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields, requestId: '' });
}
export function clearPasswords(form: HTMLFormElement) {
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="password"]')) input.value = '';
}
export function useFormProblem() {
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  return { problem, clear: () => setProblem(null), report: (error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    setProblem(error instanceof ApiProblem ? error : new ApiProblem({ status: 0, code: 'REQUEST_FAILED', message: 'The request could not be completed. Please try again.', requestId: '' }));
  } };
}
export function FormFeedback({ problem }: { problem: ApiProblem | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (problem) ref.current?.focus(); }, [problem]);
  if (!problem) return null;
  return <div className="auth-error" role="alert" tabIndex={-1} ref={ref}>
    <p>{problem.message}</p>{problem.status === 429 && problem.retryAfter && <p>Try again in {Math.ceil(problem.retryAfter)} seconds.</p>}
  </div>;
}
export function AuthField({ name, label, type, autoComplete, hint, problem }: {
  name: string; label: string; type: 'email' | 'password'; autoComplete: HTMLInputAutoCompleteAttribute; hint?: string; problem: ApiProblem | null;
}) {
  const id = `auth-${name}`; const errors = problem?.fields?.[name];
  const description = [hint ? `${id}-hint` : '', errors?.length ? `${id}-error` : ''].filter(Boolean).join(' ');
  return <div className="auth-field"><label htmlFor={id}>{label}</label>
    <input id={id} name={name} type={type} autoComplete={autoComplete} required maxLength={type === 'email' ? 254 : 256}
      autoCapitalize="none" spellCheck={false} aria-invalid={errors?.length ? true : undefined} aria-describedby={description || undefined} />
    {hint && <p className="auth-hint" id={`${id}-hint`}>{hint}</p>}
    {!!errors?.length && <p className="auth-field-error" id={`${id}-error`}>{errors.join(' ')}</p>}
  </div>;
}
export function SessionStatus() {
  const auth = useAuth();
  if (auth.error) return <section className="auth-card"><div className="auth-error" role="alert"><p>{auth.error.message}</p></div>
    <button className="button-secondary" onClick={() => { void auth.refresh(); }}>Try again</button></section>;
  return <p className="auth-loading" role="status">Loading your account…</p>;
}
export function SignOutButton() {
  const auth = useAuth(); const navigate = useNavigate(); const feedback = useFormProblem();
  async function signOut() {
    if (auth.isPending) return;
    feedback.clear();
    try { await auth.logout(); navigate(`${auth.basePath}/login`, { replace: true }); }
    catch (error) { feedback.report(error); }
  }
  return <div className="auth-signout"><button type="button" className="button-secondary" disabled={auth.isPending} onClick={() => { void signOut(); }}>Sign out</button><FormFeedback problem={feedback.problem} /></div>;
}
