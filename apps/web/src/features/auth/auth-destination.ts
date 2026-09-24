import type { Principal } from '@greenstate/contracts';
import { safeReturnPath } from './safe-return-path';
export function accountHome(principal: Principal, basePath: string): string {
  if (principal.realm === 'platform') return `${basePath}/tenants`;
  return principal.role === 'host' ? `${basePath}/host/listings` : basePath;
}
export function afterAuthentication(principal: Principal, basePath: string, requested: string | null): string {
  const destination = safeReturnPath(requested, basePath, accountHome(principal, basePath));
  return principal.mustChangePassword ? `${basePath}/password?${new URLSearchParams({ returnTo: destination })}` : destination;
}
