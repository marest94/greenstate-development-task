import { useEffect, useRef, type ReactNode } from 'react';
import type { AdminTenant } from '@greenstate/contracts';
export function AccountActionDialog({ title, tenant, busy, onClose, children }: { title: string; tenant: AdminTenant; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; const trigger = document.activeElement as HTMLElement | null; element?.showModal(); return () => { element?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); else document.querySelector<HTMLElement>('#accounts-heading')?.focus(); }; }, []);
  return <dialog ref={ref} className="account-action-dialog" aria-labelledby="account-action-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><p className="eyebrow">{tenant.name} · {tenant.slug}</p><h2 id="account-action-title">{title}</h2>{busy && <p role="status">Applying account change…</p>}{children}</dialog>;
}
