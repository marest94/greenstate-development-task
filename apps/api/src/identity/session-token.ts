import { createHash, randomBytes } from 'node:crypto';
export const SESSION_MS = 7 * 86400000;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function newSession(now: Date) {
  const token = randomBytes(32).toString('base64url');
  return { token, record: { tokenHash: tokenHash(token), createdAt: now, expiresAt: new Date(now.getTime() + SESSION_MS) } };
}
