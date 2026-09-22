import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionsFor, type Principal, type Role } from '@greenstate/contracts';
import { PermissionsGuard, RequirePermissions } from './permissions.guard.js';
class TestController { @RequirePermissions('listings:manage') listing() {} }
function context(role: Role, restricted = false): ExecutionContext {
  const principal: Principal = role === 'superadmin'
    ? { id: 'a', email: 'a@example.test', realm: 'platform', tenantId: null, role, mustChangePassword: restricted, permissions: permissionsFor(role) }
    : { id: 'a', email: 'a@example.test', realm: 'tenant', tenantId: 't', role, mustChangePassword: restricted, permissions: permissionsFor(role) };
  return { getHandler: () => TestController.prototype.listing, getClass: () => TestController, switchToHttp: () => ({ getRequest: () => ({ principal }) }) } as unknown as ExecutionContext;
}
describe('Permission enforcement', () => {
  const guard = new PermissionsGuard(new Reflector());
  it('permits an unrestricted host', () => expect(guard.canActivate(context('host'))).toBe(true));
  it('denies clients and platform identities on tenant inventory', () => { for (const role of ['client', 'superadmin'] as const) expect(() => guard.canActivate(context(role))).toThrow(); });
  it('denies every restricted role even when its ordinary permissions match', () => { for (const role of ['host', 'client', 'superadmin'] as const) expect(() => guard.canActivate(context(role, true))).toThrow('Change your password before continuing.'); });
});
