import { describe, expect, it } from 'vitest';
import { permissionsFor } from '@greenstate/contracts';
describe('Explicit role permissions', () => {
  it('gives clients only their saved-list capability', () => { expect(permissionsFor('client')).toEqual(['saved-listings:manage']); });
  it('lets hosts use client features and manage shared inventory', () => { expect(permissionsFor('host')).toEqual(['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read']); });
  it('keeps platform administration separate from tenant permissions', () => { expect(permissionsFor('superadmin')).toEqual(['tenants:manage', 'accounts:manage']); });
});
