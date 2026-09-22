import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
export function useUnsavedListing(dirty: boolean) {
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return { blocker, accept: () => { dirtyRef.current = false; } };
}
export function UnsavedListingDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; const element = dialog.current; element?.showModal(); return () => { element?.close(); if (trigger?.isConnected) trigger.focus(); }; }, []);
  return <dialog ref={dialog} className="unsaved-dialog" aria-labelledby="unsaved-heading" onCancel={event => { event.preventDefault(); onStay(); }}><h2 id="unsaved-heading">Leave without saving?</h2><p>Your listing has unsaved changes.</p><div className="host-actions"><button className="button-primary" onClick={onStay} autoFocus>Keep editing</button><button className="button-secondary" onClick={onLeave}>Discard and leave</button></div></dialog>;
}
