# Portfolio Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** View many properties together and edit a different date range for each property without leaving the timeline.

**Architecture:** A tenant-scoped paginated portfolio endpoint returns properties and their day states in one response. An atomic range mutation extends the existing tenant/listing locking protocol. The frontend uses URL-backed navigation and a single-property range editor.

**Tech Stack:** Existing NestJS, Prisma/PostgreSQL, Zod, React, React Router and TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-22-host-admin-improvements.md`

## Global Constraints

- Calendar overview and editing ship together.
- API intervals remain half-open.
- Writes are bounded to 31 nights.
- Default 20 properties per page, maximum 50; desktop 14 nights, mobile 7.
- Bookings are never modified.
- Tenant isolation, CSRF, fresh tenant business date, cancellation and private-cache boundaries remain intact.

## Review Focus

- A booked night midway through a selection rejects the entire add, with zero inserted blocks.
- Existing manual blocks and their reasons survive an add spanning both free and blocked nights.
- A stale request cannot change another property's draft or restore state after sign-out.
- Checkout, leap-day, month/year and valid-date upper bounds preserve half-open semantics.
- Concurrent archive/deletion/timezone changes are rechecked inside the locked transaction.

### Task 1: Portfolio contract and snapshot query

**Files:** Create `packages/contracts/src/portfolio-calendar.ts`, `apps/api/src/availability/portfolio-calendar.controller.ts`, `apps/api/src/availability/portfolio-calendar.repository.ts`, `apps/api/test/portfolio-calendar.test.ts`; modify contracts index, `apps/api/src/availability/host-calendar.module.ts`, `apps/api/src/db/tenant-db.ts`.

**Interfaces:** `GET /api/v1/t/:slug/host/calendar`; `PortfolioCalendarQuerySchema` accepts from/to, page/pageSize, search/city, status; `PortfolioCalendarPageSchema` returns today/from/to/page/pageSize/total/items, each item `{ listing: HostListingView, days: HostCalendarDay[], bookings: BookingDto[] }`.

- [ ] Write integration tests using existing `inventoryFixture`, `calendarAccount`, `bookingData`, `createTestDatabase` helpers. Pin endpoint availability and tenant isolation first:

```ts
const response = await request(app.getHttpServer())
  .get(`/api/v1/t/${f.a.slug}/host/calendar`).set('Cookie', host)
  .query({ from: '2026-10-09', to: '2026-10-23', pageSize: 1 }).expect(200);
expect(response.body.items).toHaveLength(1);
expect(response.body.items[0].listing.id).not.toBe(f.listingB.id);
expect(response.body.items[0].days).toHaveLength(14);
```

Add tests for literal title/city filters, archive status, empty/out-of-range pages, non-host permissions, invalid dates and ranges longer than 31 nights, cancelled bookings, checkout dates and overlapping legacy blocks. Run `npm run test:integration -w apps/api -- test/portfolio-calendar.test.ts`; expected red: endpoint 404.

- [ ] Define strict schemas with 1–31-night validation using UTC midnight date arithmetic. Implement the route with existing guards and `calendar:manage`. Add optional isolation-level argument to `TenantDb.run` preserving ReadCommitted default; call only the portfolio operation with RepeatableRead. Query count, bounded listing page, bookings and blocks for those listing IDs inside that transaction. Map dates/DTOs using existing mappers and calculate booked precedence over blocks. Example state assembly:

```ts
const bookingIds = bookings.filter(b => b.listingId === listing.id &&
  b.status !== 'cancelled' && b.checkIn <= date && b.checkOut > date).map(b => b.id);
const block = blocksByListingAndDate.get(`${listing.id}:${date}`) ?? null;
return { date, bookingIds, block, status: bookingIds.length ? 'booked' : block ? 'blocked' : 'available' };
```

- [ ] Run the integration file; expected all green. Commit `feat: expose a paginated portfolio calendar`.

### Task 2: Atomic range block mutation

**Files:** Modify `packages/contracts/src/host-calendar.ts`, `apps/api/src/availability/host-calendar.controller.ts`, `host-calendar.service.ts`, `host-calendar.repository.ts`, `apps/api/test/host-calendar.test.ts`.

**Interfaces:** `POST /host/listings/:id/block-range`; input `{from,to,action:'block'|'unblock',reason?:string}`, strict maximum 31 nights; output `{changed:number}`. Existing single-day endpoints remain compatible.

- [ ] Add tests before implementation. A fixture booked October 10–12 rejects the wider October 9–14 range without creating October 9 or 12–13 blocks:

```ts
await request(app.getHttpServer()).post(`${base(listing.id)}/block-range`)
  .set(calendarCsrf).set('Cookie', host)
  .send({ from: '2026-10-09', to: '2026-10-14', action: 'block' }).expect(409);
expect(await db.admin.blockedDay.count({ where: { listingId: listing.id } })).toBe(0);
```

Add free-range success, existing-reason preservation, changed=0, unblock with legacy occupied block, foreign IDs, CSRF, invalid/oversized spans, midnight, archive/deletion/timezone ordering and concurrent overlapping range tests. Run the file; expected red: new route 404.

- [ ] Validate body then `db.write` → `lockListing` → action. For block, check archived and fresh today, then overlap with `checkIn < to && checkOut > from && status != cancelled`. Reject before writing. Read existing blocks; create only missing dates using `createMany`; preserve existing reasons. For unblock use tenant/listing/date-scoped `deleteMany`. Return actual affected count. Reuse `eachDay`, `toDbDate`, `todayIn`; no per-night transactions.

```ts
return this.db.write(tenantId, async (tx, tenant) => {
  const listing = await lockListing(tx, tenantId, listingId);
  // Validate archive/date/booking conditions before the first insert.
  const where = { tenantId, listingId, date: { gte: toDbDate(input.from), lt: toDbDate(input.to) } };
  if (input.action === 'unblock') return { changed: (await tx.blockedDay.deleteMany({ where })).count };
  // After validation, create missing nights atomically and return count.
});
```

- [ ] Run host-calendar plus portfolio integration tests; expected green including existing single-day behavior. Commit `feat: manage availability blocks by date range`.

### Task 3: Portfolio UI and accessible range editor

**Files:** Create `apps/web/src/features/host/PortfolioCalendarPage.tsx`, `PortfolioGrid.tsx`, `AvailabilityRangeEditor.tsx`, `portfolio-calendar.css`, `portfolio-calendar.test.tsx`; modify `HostLayout.tsx`, `apps/web/src/app/router.tsx`; create `e2e/portfolio-calendar.spec.ts`.

**Interfaces:** Page consumes Task 1 response and Task 2 mutation. Grid receives rows/dates/selection/onSelect; editor receives selected row, inclusive first/last nights, pending flag, onSave/onClose. Helpers explicitly convert inclusive UI dates to exclusive API end.

- [ ] Write component tests with real router/query provider and HTTP interception. Select a first and final night, verify named property and affected-night preview, then submit and assert API request and refreshed state:

```ts
await user.click(screen.getByRole('button', { name: 'Garden apartment, 10 October 2026, available' }));
await user.click(screen.getByRole('button', { name: 'Garden apartment, 12 October 2026, available' }));
expect(screen.getByText('3 nights will be blocked')).toBeVisible();
await user.click(screen.getByRole('button', { name: 'Block 3 nights' }));
expect(writes.at(-1)?.body).toEqual({ from: '2026-10-10', to: '2026-10-13', action: 'block' });
```

Add selection on another row, exact booking details, invalid date input, conflict retaining reason, existing-block counts, page/filter URL persistence, sign-out abort, keyboard selection and focus restoration. Run `npm test -w apps/web -- portfolio-calendar.test.tsx`; expected red for absent feature.

- [ ] Implement route and navigation, strict URL validation, desktop/mobile window navigation, scoped query keys and abort signals. Render a semantic table with sticky headers/first column and labelled buttons. Preserve independent filters and pageSize. Use inclusive date inputs in the panel; disable mutation when invalid/occupied/past/archived. Disable selection/navigation during writes; server success invalidates host/public caches without remounting the scroll container. Conflict refresh keeps the draft. Mobile editing uses a native dialog bottom sheet with focus return and Escape dismissal when idle.

```tsx
<button type="button" aria-pressed={selected}
  aria-label={`${listing.title}, ${formatDate(day.date)}, ${day.status}`}
  onClick={() => onSelect(listing.id, day.date)}>{statusLabel[day.status]}</button>
```

- [ ] Run component suite; run typecheck/lint/build. Add Playwright scenarios creating an isolated fixture listing, selecting and removing a range, navigating another property, opening booking details, and inspecting mobile keyboard/touch behavior. Run with the demo stack and clean test-created records through existing fixture cleanup. Expected all green, no uncaught browser errors. Commit `feat: add host portfolio availability workspace`.

### Release verification

- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build -w apps/web`.
- [ ] Run real PostgreSQL integration suite and authenticated/public browser suites using existing repo scripts.
- [ ] Review desktop and 375px mobile, including sticky cells, panel overflow and scroll preservation.
- [ ] Request one independent whole-change code review, resolve substantive findings and rerun affected checks.

## Execution outcome

Implemented and verified on 2026-09-23. See `docs/host-admin-workflows.md` for behavior, implementation decisions and exact validation totals. All deliverables are included in the local workflow implementation commit.
