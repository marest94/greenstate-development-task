# Host Inventory and Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find properties quickly and edit their details with fewer navigation and data-entry mistakes.

**Architecture:** Extend existing inventory query contracts and parameterized SQL, then add URL-backed filters and direct actions. Preserve the existing editor's server-version handling while adding semantic field groups, coordinate preview and navigation protection.

**Tech Stack:** Existing Zod, Prisma, React Router, TanStack Query and Leaflet.

**Spec:** `docs/superpowers/specs/2026-09-22-host-admin-improvements.md`

## Global Constraints

- All inventory filtering is server-side and tenant-scoped.
- Default 20 properties per page, maximum 50.
- Archive and stale-version behavior remain intact.
- No database schema migration or new dependency is expected.

## Review Focus

- Literal `%` and `_` in search must not act as SQL wildcards.
- Equal prices/titles must paginate deterministically with ID tie-breaks.
- Empty or invalid coordinates must not display a misleading zero-coordinate pin.
- Save failure and version conflict retain user input and dirty state.
- Browser back, internal links and successful create navigation distinguish dirty from saved state.

### Task 1: Inventory discovery and shortcuts

**Files:** Modify `packages/contracts/src/host-listings.ts`, `apps/api/src/listings/host-listings.repository.ts`, `apps/api/test/host-listings.test.ts`, `apps/web/src/features/host/ListingsPage.tsx`, `host.css`, `listings.test.tsx`, `e2e/host.spec.ts`.

**Interfaces:** Extend `HostListingsQuerySchema` with optional search (max 200), city (max 80), propertyType (existing enum), sort (`title`, `price-asc`, `price-desc`, default title). Response schema remains unchanged.

- [ ] Write API tests using existing integration fixtures for search, combined filters and sort ties. Add a title containing `100%` and confirm search `%` returns only literal matches. Add component test applying title/city/type/sort from page 2, confirming page resets to 1 while pageSize survives; assert all direct actions and archived Preview omission. Run the respective files; expected new filters rejected before implementation.
- [ ] Extend strict query schema and parameterized SQL conditions. Use literal substring matching and a fixed sort map:

```ts
if (query.search) conditions.push(Prisma.sql`position(${query.search.toLowerCase()} in lower(l.title)) > 0`);
if (query.city) conditions.push(Prisma.sql`position(${query.city.toLowerCase()} in lower(l.city)) > 0`);
if (query.propertyType) conditions.push(Prisma.sql`l.property_type = ${query.propertyType}`);
const order = {
  title: Prisma.sql`title COLLATE "C", id`,
  'price-asc': Prisma.sql`"pricePerNightCents" ASC, title COLLATE "C", id`,
  'price-desc': Prisma.sql`"pricePerNightCents" DESC, title COLLATE "C", id`,
}[query.sort];
```

Apply `order` inside the existing paginated CTE. Never interpolate a user-supplied SQL fragment.

- [ ] Replace status-only toolbar with a labelled filter form. Construct URLSearchParams from nonempty form fields, preserve pageSize and set page=1. Pagination starts from existing URL parameters. Add per-row Edit/Calendar/Bookings/Preview links with property-specific accessible names. Calendar can open the portfolio workspace with title search, while retaining direct access to the existing single-listing calendar.

```tsx
<Link to={`${auth.basePath}/host/listings/${item.id}/calendar`}
  aria-label={`Calendar for ${item.title}`}>Calendar</Link>
```

- [ ] Run API integration and web listing tests; expected green. Exercise combined filters in browser, including an empty result. Commit `feat: improve host inventory discovery`.

### Task 2: Structured editor and unsaved-change protection

**Files:** Modify `apps/web/src/features/host/ListingForm.tsx`, `host.css`, `listings.test.tsx`; create `ListingLocationPreview.tsx`, `useUnsavedListing.ts`; modify `e2e/host.spec.ts`.

**Interfaces:** `useUnsavedListing(dirty:boolean)` provides React Router blocker state and beforeunload protection; the editor owns its accepted baseline and form values. `ListingLocationPreview` takes raw latitude/longitude strings plus city/country and renders existing `LocationMap` only for valid coordinates.

- [ ] Write tests before implementing behavior. Cover saved/dirty/failed-save/reverted states, blocked internal navigation, stay/discard actions, create-save navigation, stale reload and invalid map coordinates. The key user behavior:

```ts
await user.type(screen.getByLabelText('Title'), ' revised');
await user.click(screen.getByRole('link', { name: 'Back to inventory' }));
expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
await user.click(screen.getByRole('button', { name: 'Keep editing' }));
expect(screen.getByLabelText('Title')).toHaveValue('Garden apartment revised');
```

Run `npm test -w apps/web -- listings.test.tsx`; expected red: navigation currently discards the form.

- [ ] Group fields in visible fieldsets: Basics(title/description/type), Capacity(maxGuests/bedrooms), Pricing(price), Location(city/country/latitude/longitude). Use current validation and money parsing. Snapshot current form values against accepted values after save/reload; do not mark dirty just because focus moved or a field was edited then restored. Use `useBlocker` in the existing data router and `beforeunload` only while dirty. Clear the dirty ref synchronously before successful create navigation. Archive actions require saving or explicitly discarding dirty edits first.

```ts
useEffect(() => {
  if (!dirty) return;
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
}, [dirty]);
```

- [ ] Validate nonempty coordinate strings using existing latitude/longitude schemas before rendering the preview. Reuse the map and attribution, with host-scoped sizing. A failed tile load leaves the external OpenStreetMap link usable.
- [ ] Run component tests and typecheck/lint/build, then browser cases for internal navigation, browser back and reload prompt. Expected saved navigation is uninterrupted; dirty draft survives Keep editing and failed saves. Commit `feat: clarify listing editing and protect unsaved changes`.

## Execution outcome

Implemented and verified on 2026-09-23. See `docs/host-admin-workflows.md` for behavior, implementation decisions and exact validation totals. All deliverables are included in the local workflow implementation commit.
