import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminTenantSchema, TenantCreateSchema, TenantUpdateSchema, type AdminTenant } from '@greenstate/contracts';
import { api } from '../../lib/api';
import { FormFeedback, validationProblem } from '../auth/AuthForm';
import { AdminField, TenantResource, tenantsApi, useAdminInvalidation, useAdminRequest } from './shared';
export function TenantForm({ mode }: { mode: 'create' | 'edit' }) { return mode === 'create' ? <Editor key="create" initial={null} /> : <TenantResource>{tenant => <Editor key={tenant.id} initial={tenant} />}</TenantResource>; }
function Editor({ initial }: { initial: AdminTenant | null }) {
 const [tenant, setTenant] = useState(initial); const [confirm, setConfirm] = useState(false); const [message, setMessage] = useState(''); const request = useAdminRequest(); const invalidate = useAdminInvalidation(); const navigate = useNavigate();
 function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const value = (key: string) => String(form.get(key) ?? '');
  const body = { name: value('name'), timezone: value('timezone'), primaryColor: value('primaryColor').trim() || null, contactEmail: value('contactEmail').trim() || null, ...(!tenant ? { slug: value('slug') } : {}) };
  const parsed = (tenant ? TenantUpdateSchema : TenantCreateSchema).safeParse(body); if (!parsed.success) { request.feedback.report(validationProblem(parsed.error.issues)); return; }
  void request.run(async signal => { const saved = tenant ? await api.patch(`${tenantsApi}/${tenant.id}`, parsed.data, AdminTenantSchema, signal) : await api.post(tenantsApi, parsed.data, AdminTenantSchema, signal); if (signal.aborted) return; setTenant(saved); invalidate(); setMessage('Tenant configuration saved.'); if (!tenant) navigate(`/admin/tenants/${saved.id}`, { replace: true }); });
 }
 return <section className="host-editor"><Link className="back-link" to="/admin/tenants">Back to tenants</Link><p className="eyebrow">Platform administration</p><h1>{tenant ? `Manage ${tenant.name}` : 'Create tenant'}</h1>{tenant?.deletedAt && <p role="status">This tenant is deleted. Access is disabled; records are retained.</p>}<FormFeedback problem={request.feedback.problem} />{message && <p role="status" className="host-success">{message}</p>}
 <form className="host-form" noValidate onSubmit={submit}><fieldset disabled={request.busy || !!tenant?.deletedAt}><legend className="host-sr-only">Tenant configuration</legend><div className="host-form-grid">
 <AdminField label="Tenant name" name="name" defaultValue={tenant?.name ?? ''} maxLength={120} required problem={request.feedback.problem} />
 <AdminField label="Portal slug" name="slug" defaultValue={tenant?.slug ?? ''} readOnly={!!tenant} required hint="Used in the portal URL. It cannot be changed or reused after deletion." problem={request.feedback.problem} />
 <AdminField label="Business time zone" name="timezone" defaultValue={tenant?.timezone ?? 'Europe/Berlin'} required hint="A named zone, such as Europe/Berlin. Calendar rules use this tenant-wide date." problem={request.feedback.problem} />
 <AdminField label="Brand colour" name="primaryColor" defaultValue={tenant?.primaryColor ?? ''} placeholder="#145C43" maxLength={7} hint="Optional six-digit hex colour. Light colours use readable dark text; leave blank for the default." problem={request.feedback.problem} />
 <AdminField label="Contact email" name="contactEmail" type="email" defaultValue={tenant?.contactEmail ?? ''} maxLength={254} problem={request.feedback.problem} />
 </div>{!tenant?.deletedAt && <div className="host-actions"><button className="button-primary">{tenant ? 'Save configuration' : 'Create tenant'}</button></div>}</fieldset></form>
 {tenant && !tenant.deletedAt && <><p><Link to={`/admin/tenants/${tenant.id}/accounts`}>Manage accounts</Link> · <Link to={`/${tenant.slug}`}>Open public portal</Link></p><section className="host-archive"><h2>Delete tenant</h2><p>Disable this portal and all of its accounts. The tenant’s records are retained.</p>{confirm ? <div className="host-confirm" role="group" aria-label="Confirm tenant deletion"><p>Delete {tenant.name}? All sessions will be revoked and access disabled. Listings, bookings, accounts and saved records are retained. The slug remains reserved.</p><div className="host-actions"><button className="button-secondary" disabled={request.busy} onClick={() => { void request.run(async signal => { await api.delete(`${tenantsApi}/${tenant.id}`, undefined, undefined, signal); if (signal.aborted) return; invalidate(); navigate('/admin/tenants', { replace: true }); }); }}>Confirm deletion</button><button className="button-secondary" disabled={request.busy} onClick={() => setConfirm(false)}>Keep tenant</button></div></div> : <button className="button-secondary" disabled={request.busy} onClick={() => setConfirm(true)}>Delete tenant</button>}</section></>}
 </section>;
}
