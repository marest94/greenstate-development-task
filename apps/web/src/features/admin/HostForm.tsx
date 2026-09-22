import { useRef, type FormEvent } from 'react';
import { HostCreateSchema, TenantAccountSchema } from '@greenstate/contracts';
import { api } from '../../lib/api';
import { clearPasswords, FormFeedback, validationProblem } from '../auth/AuthForm';
import { AdminField, checkIdentity, IdentityConfirmation, tenantsApi, useAdminRequest } from './shared';
export function HostForm({ tenantId, onSuccess, onCancel, onExisting }: { tenantId: string; onSuccess: () => void; onCancel: () => void; onExisting: (email: string) => void }) {
 const request = useAdminRequest(); const submittedEmail = useRef('');
 function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
  try { checkIdentity(form); } catch (error) { request.feedback.report(error); return; }
  const parsed = HostCreateSchema.safeParse(Object.fromEntries(['name', 'email', 'temporaryPassword'].map(key => [key, String(form.get(key) ?? '')])));
  if (!parsed.success) { request.feedback.report(validationProblem(parsed.error.issues)); return; }
  submittedEmail.current = parsed.data.email;
  void request.run(async signal => { await api.post(`${tenantsApi}/${tenantId}/hosts`, parsed.data, TenantAccountSchema, signal); if (signal.aborted) return; clearPasswords(element); onSuccess(); });
 }
 return <section className="admin-action" aria-labelledby="host-create-heading"><h2 id="host-create-heading">Create host account</h2><p>The host must change the temporary password before managing listings. Verify identity and arrange secure delivery outside the app.</p><FormFeedback problem={request.feedback.problem} />{request.feedback.problem?.code === 'ACCOUNT_EXISTS' && <p>A client can be promoted with separate confirmation and a fresh temporary password. <button type="button" className="button-secondary" onClick={() => onExisting(submittedEmail.current)}>Find existing account</button></p>}
 <form className="host-form" noValidate onSubmit={submit}><fieldset disabled={request.busy}><legend className="host-sr-only">Host account details</legend><AdminField name="name" label="Host name" required maxLength={120} problem={request.feedback.problem} /><AdminField name="email" label="Email address" type="email" autoComplete="off" required maxLength={254} problem={request.feedback.problem} /><AdminField name="temporaryPassword" label="Temporary password" type="password" autoComplete="new-password" required maxLength={256} hint="15–128 characters. Deliver this password securely outside the app." problem={request.feedback.problem} /><IdentityConfirmation /><div className="host-actions"><button className="button-primary">Create host account</button><button className="button-secondary" type="button" onClick={onCancel}>Cancel</button></div></fieldset></form></section>;
}
