export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 1) return null;
  return <nav className="pagination" aria-label="Results pages">
    <button type="button" className="button-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous page</button>
    <span aria-live="polite">Page {page} of {pages}</span>
    <button type="button" className="button-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next page</button>
  </nav>;
}
