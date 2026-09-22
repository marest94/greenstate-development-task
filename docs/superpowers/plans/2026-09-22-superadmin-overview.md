# Superadmin Overview and Account Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant setup, portfolio size and account actions easier to understand and operate.

**Architecture:** Add authenticated aggregate tenant summaries without changing ordinary tenant DTOs or tenant-host permissions. Derive onboarding steps from summary facts and wrap existing account forms in a focused, accessible action dialog.

**Tech Stack:** Existing NestJS, Prisma/PostgreSQL, Zod, React and native HTML dialog.

**Spec:** `docs/superpowers/specs/2026-09-22-host-admin-improvements.md`

## Global Constraints

- Counts cover the whole tenant, never just a displayed page.
- Platform authentication does not impersonate a host.
- Password, identity confirmation, session revocation and deleted-tenant protections remain intact.
- Never persist temporary passwords or transmit credentials in links.

## Review Focus

- Multiple listings and accounts must not multiply aggregate counts through a joined cross product.
- Disabled hosts cannot satisfy the enabled-host onboarding step.
- Deleted tenants retain counts while onboarding actions remain disabled.
- Switching action/account cannot preserve another person's password draft or confirmation.
- Closing, sign-out and late responses cannot leak action state or restore revoked private caches.

### Task 1: Tenant-wide summaries and onboarding

**Files:** Modify `packages/contracts/src/admin.ts`, `apps/api/src/admin/tenants.repository.ts`, `tenants.service.ts`, `tenants.controller.ts`, `apps/api/test/admin.test.ts`, `apps/web/src/features/admin/TenantsPage.tsx`, `TenantForm.tsx`, `admin.test.tsx`, `admin.css`; create `TenantSetupChecklist.tsx`.

**Interfaces:** Add `TenantCountsSchema` `{activeListings,archivedListings,accounts,enabledHosts}` with nonnegative integers. List rows use `AdminTenantSummarySchema = AdminTenantSchema.extend({counts:TenantCountsSchema})`. Existing detail/create/update DTO stays unchanged. `GET /admin/tenants/:id/summary` returns `AdminTenantSummary` under existing platform tenant-management permissions.

- [ ] Write integration tests for a tenant with two active listings, one archived listing, two enabled hosts, one disabled host and a client; pin exact aggregate values:

```ts
expect(summary.body.counts).toEqual({ activeListings: 2, archivedListings: 1, accounts: 4, enabledHosts: 2 });
```

Test empty/deleted tenants, foreign tenant separation, denied client/host sessions and missing IDs. Component tests verify counts render, checklist updates after host creation/disable, and deleted tenants suppress setup actions. Run API/admin web files; expected red for absent summary route/schema.

- [ ] Query counts separately per entity type and combine with tenant rows. For paginated list summaries, aggregate only for IDs in the page and use left joins/COALESCE to represent zero honestly. A single SQL statement provides a coherent summary snapshot. Use actual mapped table names from the Prisma schema, with bound tenant UUIDs. Do not attach default zeros to normal create/update responses.

```ts
export const TenantCountsSchema = z.strictObject({
  activeListings: z.number().int().nonnegative(),
  archivedListings: z.number().int().nonnegative(),
  accounts: z.number().int().nonnegative(),
  enabledHosts: z.number().int().nonnegative(),
});
export const AdminTenantSummarySchema = AdminTenantSchema.extend({ counts: TenantCountsSchema });
```

- [ ] Display active/archived listing totals, total accounts and enabled hosts on tenant list. Render checklist on tenant detail: created, enabled host exists, active listing exists. Link account step to existing account management. Explain listing creation belongs to tenant hosts and link the public portal for preview; do not offer a privileged impersonation action. Invalidate summary query after mutations via existing admin invalidation.
- [ ] Run integration/component tests, typecheck and lint; expected green. Commit `feat: add tenant portfolio summaries and setup checklist`.

### Task 2: Focused account action dialog

**Files:** Create `apps/web/src/features/admin/AccountActionDialog.tsx`; modify `AccountsPage.tsx`, `HostForm.tsx`, `ResetPasswordForm.tsx`, `admin.css`, `admin.test.tsx`, `e2e/admin.spec.ts`.

**Interfaces:** Dialog receives title, tenant, optional account, busy, onClose and children. Existing action forms remain responsible for their requests and validation; expose pending state to the container or lift the request state so cancellation cannot silently change action during a write.

- [ ] Add interaction tests for row selection, tenant/account context, initial focus, Escape/cancel focus return, pending action controls, form reset on action change, sign-out cancellation and success refresh. Preserve existing identity-confirmation tests. Example:

```ts
await user.click(within(accountRow).getByRole('button', { name: 'Reset password' }));
const dialog = screen.getByRole('dialog', { name: 'Reset password' });
expect(within(dialog).getByText('host@example.test')).toBeVisible();
expect(within(dialog).getByText('GreenState · greenstate')).toBeVisible();
await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
expect(within(accountRow).getByRole('button', { name: 'Reset password' })).toHaveFocus();
```

Run the admin component tests; expected red for absent dialog.

- [ ] Move existing action content into a native modal dialog, keyed by tenant/action/account. Open with `showModal()` and close with native `close()` before restoring trigger focus. Render tenant/account identity above the form, keeping password fields out of URLs/storage/logs. Disable dismissal while a request is being applied and announce progress. On unmount, abort via the existing request controller. Put errors inside the visible dialog. Restore row focus if present after refresh, otherwise focus the accounts heading.
- [ ] Run admin component tests plus authenticated browser suite. Inspect desktop and mobile overflow, keyboard tab containment, Escape and pending action behavior. Expected existing access/security semantics unchanged. Commit `feat: focus superadmin account actions`.

### Final verification across all three deliverables

- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build -w apps/web`.
- [ ] Run PostgreSQL integration tests through the repository integration configuration, including tenant isolation, calendar, listings, admin and race tests.
- [ ] Rebuild the isolated `greenstate-ui` Docker stack and run host/calendar/admin/public browser regressions with `STACK_BASE_URL=http://localhost:8081`.
- [ ] Complete independent code review, fix substantive findings and record exact passing commands and remaining limitations in the final user report.

## Execution outcome

Implemented and verified on 2026-09-23. See `docs/host-admin-workflows.md` for behavior, implementation decisions and exact validation totals. All deliverables are included in the local workflow implementation commit.
