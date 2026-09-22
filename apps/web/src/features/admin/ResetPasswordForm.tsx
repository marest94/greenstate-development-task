import type { FormEvent } from 'react';
import { AccountResetSchema, type TenantAccount } from '@greenstate/contracts';
import { api } from '../../lib/api';
import { clearPasswords, FormFeedback, validationProblem } from '../auth/AuthForm';
import { AdminField, checkIdentity, IdentityConfirmation, tenantsApi, useAdminRequest } from './shared';
export function ResetPasswordForm({ account, mode, onSuccess, onCancel }: { account: TenantAccount; mode: 'reset' | 'promote'; onSuccess: () => void; onCancel: () => void }) {
 const request = useAdminRequest();
 function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
  try { checkIdentity(form); } catch (error) { request.feedback.report(error); return; }
  const parsed = AccountResetSchema.safeParse({ temporaryPassword: String(form.get('temporaryPassword') ?? '') }); if (!parsed.success) { request.feedback.report(validationProblem(parsed.error.issues)); return; }
  void request.run(async signal => { await api.post(`${tenantsApi}/${account.tenantId}/accounts/${account.id}/${mode === 'promote' ? 'promote-host' : 'password-reset'}`, parsed.data, undefined, signal); if (signal.aborted) return; clearPasswords(element); onSuccess(); });
 }
 return <section className="admin-action" aria-labelledby="reset-heading"><h2 id="reset-heading">{mode === 'promote' ? 'Promote client to host' : 'Reset account password'}</h2><p><strong>{account.email}</strong></p><p>{mode === 'promote' ? 'Promotion grants host permissions and replaces the existing password. ' : ''}All existing sessions will be revoked. The account keeps its saved listings and must change the temporary password before continuing. A disabled account stays disabled.</p><FormFeedback problem={request.feedback.problem} /><form className="host-form" noValidate onSubmit={submit}><fieldset disabled={request.busy}><legend className="host-sr-only">Temporary credentials and identity confirmation</legend><AdminField name="temporaryPassword" label="Temporary password" type="password" autoComplete="new-password" required maxLength={256} hint="15–128 characters. Deliver this password securely outside the app." problem={request.feedback.problem} /><IdentityConfirmation /><div className="host-actions"><button className="button-primary">{mode === 'promote' ? 'Confirm promotion' : 'Confirm password reset'}</button><button className="button-secondary" type="button" onClick={onCancel}>Cancel</button></div></fieldset></form></section>;
}
