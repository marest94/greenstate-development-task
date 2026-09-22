import { AppError } from '../common/http/errors.js';
export function invalidCredentials(): never { throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.'); }
export function sameCredentials(a: { credentialVersion: number; passwordHash: string }, b: { credentialVersion: number; passwordHash: string }) {
  return a.credentialVersion === b.credentialVersion && a.passwordHash === b.passwordHash;
}
