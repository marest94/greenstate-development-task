/** Return destinations must stay within the current tenant or platform portal. */
export function safeReturnPath(value: string | null, basePath: string, fallback = `${basePath}/account`): string {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return fallback;
  if ([...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  const pathname = value.split(/[?#]/, 1)[0]!;
  // Our routes use ASCII slugs and UUIDs. Reject encoded path separators and traversal,
  // including multiple encoding layers, without rejecting encoded search filters.
  if (pathname.includes('%')) return fallback;
  const parsed = new URL(value, 'https://portal.invalid');
  if (parsed.origin !== 'https://portal.invalid' || parsed.pathname !== pathname) return fallback;
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return fallback;
  const firstSegment = pathname.slice(basePath.length + 1).split('/')[0];
  if (['login', 'register', 'password'].includes(firstSegment?.toLowerCase() ?? '')) return fallback;
  return value;
}
