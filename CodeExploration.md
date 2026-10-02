VibeRent — Codebase Exploration Report
Stack: Next.js 16.3.6 (App Router), React 19.3, TypeScript 5.9, Tailwind CSS v4 (via @tailwindcss/postcss), Radix primitives (dialog, dropdown-menu, slot), better-sqlite3 + Drizzle ORM 0.45, Better Auth 1.7, Resend for email. No shadcn CLI config file found — the components/ui/ layer is a single hand-built button.tsx; most dialogs use Radix directly.

1. App structure
src/app/ — routes
Auth flow (public, no shell) — gated by src/app/layout.tsx:13-25 which redirects unauthenticated users to /sign-in and users without an agency to /onboarding:

sign-in/page.tsx, sign-up/page.tsx, forgot-password/page.tsx, reset-password/page.tsx, check-email/page.tsx

accept-invitation/[id]/page.tsx, onboarding/page.tsx

Components: src/components/auth/auth-forms.tsx, auth-frame.tsx, invitation-card.tsx, onboarding-form.tsx; client SDK in src/lib/auth-client.ts

App routes (behind auth + AppShell):

page.tsx — Dashboard, fully DB-backed via getDashboard() (src/server/services/dashboard-service.ts): live stats, today's pickups/returns, audit-event activity feed

vehicles/page.tsx — client component, CRUD via vehicleRepository → Server Actions → real SQLite

vehicles/[id]/page.tsx + loading.tsx — VehicleWorkspace; vehicle record is DB-backed but detail tabs (bookings/expenses/maintenance/documents fixtures) still come from src/lib/vehicle-detail-data.ts

[section]/page.tsx — dynamic catch-all for bookings | customers | expenses | reports | owners | settings:

Owners, Expenses, Reports: server-rendered with real DB services (owner-service, expense-service, report-service)

Bookings (BookingsWorkspace) and Customers (CustomersModule): client components calling real Server Actions (listBookingsAction, createCustomerAction, etc.) — DB-backed despite docs still calling them "mock"

Settings: SettingsWorkspace — branches are real (organization.ts actions); policies/catalogs/roles/communication templates remain presentation-only

Detail routes, all DB-backed server pages: bookings/[id]/page.tsx (getBooking service), customers/[id]/page.tsx (getCustomerDetail), owners/[id]/page.tsx (getOwner)

bookings/new/page.tsx — BookingWizard (uses booking Server Actions)

Chrome: error.tsx, not-found.tsx, globals.css; src/proxy.ts injects x-viberent-path header used by the root layout for auth gating

src/components/
shared/ — the full primitive set from AGENTS.md: page-header, data-table (with mobileCard renderer), filter-bar, status-badge, confirm-dialog, empty-state, loading-state, inline-error, action-menu, toast, detail-layout

layout/ — app-shell.tsx, command-palette.tsx (⚠️ searches src/lib/mock-data.ts / operations-data.ts fixtures, not the DB)

Feature dirs: bookings/, customers/, owners/, expenses/, reports/, settings/, vehicles/, dashboard/, auth/, forms/form-controls.tsx

modules/operations-module.tsx — legacy generic mock module; no longer imported anywhere (dead code)

src/lib/
Live: utils.ts (formatPkr etc.), auth-client.ts, repositories/vehicle-repository.ts (delegates to Server Actions), repositories/repository.ts (shared RepositoryResult contract)

Mock fixtures (see §4): mock-data.ts, booking-data.ts, operations-data.ts, finance-data.ts, owner-statement-data.ts, vehicle-detail-data.ts

repositories/booking-repository.ts — InMemoryBookingRepository, no longer imported by any component (dead code; only self-referenced)

src/server/ — the real backend layer (all server-only)
auth/: auth.ts (Better Auth config), session.ts (viewer resolution, staff-profile sync into users, branch access), authorize.ts (requireRole), permissions.ts (Better Auth org roles), email.ts (Resend)

context/request-context.ts — RequestContext with requestId, agencyId, membershipId, branchIds, roles

services/ — 9 services: vehicle, booking (455 LOC, transactional), customer, owner, expense, report, dashboard, operations, activity, session. All take RequestContext, call requireRole, scope by agencyId

repositories/: contracts.ts (DTO types), drizzle/vehicle-repository.ts (only Drizzle repository; other services use raw sqlite.prepare SQL directly)

validation/ — input parsers for booking, customer, expense, vehicle, rental-operation

api/response.ts — {data, meta.requestId} / {error} envelope

domain/errors.ts — DomainError with codes + HTTP status

src/types/ — only vehicle.ts (UI-facing Vehicle type with Own|Managed, Available|Booked|Maintenance|Out of Service|Archived)
2. Backend state — much further along than the docs say
api_state.md (reviewed 2026-09-27) is the most current source; docs/CHANGELOG.md is stale (still claims "Authentication, persistence... not implemented").

Schema (src/db/schema.ts, 133 lines, ~24 tables): Better Auth core (user, session, account, verification, organization, member, invitation) + domain tables: agencies, branches, users (agency staff linked to auth user + membership), member_branch_access, invitation_branch_access, owners, management_agreements (versioned), vehicles (unique agency+plate), vehicle_rate_rules, customers (normalized phone/CNIC, unique per agency), bookings (half-open interval indexes), availability_blocks, financial_transactions (idempotency keys), expenses, private_files, audit_events, rental_inspections (unique per booking+kind), owner_payouts (idempotent). All tenant tables keyed by agencyId; optimistic version columns; soft-delete archivedAt.

Migrations — drizzle/0000–0005 (+ snapshots/journal):

0000 — initial 13 domain tables

0001 — vehicle attributes (category/color/transmission/fuel), agreement share fields

0002 — owner_payouts

0003 — Better Auth tables

0004 — invitation branch access

0005 — vehicle_rate_rules

Connection (src/db/connection.ts): .data/viberent.db (default) with WAL, FK on, 5s busy timeout. A live seeded DB exists in .data/.

Auth: Better Auth is fully wired — email/password with Resend reset/verification emails, organization plugin with custom roles (agency_owner, fleet_manager, rental_agent, accountant), invitations with branch access, session hook sets activeOrganizationId, handler at src/app/api/auth/[...all]/route.ts, rate limiting (100/min). session.ts syncs Better Auth users into the agency users table and writes staff.joined audit events.

Server Actions (src/app/actions/): vehicles.ts, bookings.ts (confirm/amend/payments/deposits/reversals/blocks), customers.ts, owners.ts, expenses.ts, organization.ts (556 LOC — branches, team, invitations).

REST API — /api/v1 is real and broad (17 routes): session, operations/today, vehicles (+/:id, availability), bookings (+/:id, checkout, checkin, payments), customers (+/:id), expenses, activity (cursor feed). All run through the same services with the shared response envelope. Pending per api_state.md: uploads, native mobile tokens, rate limiting for API.

Seed (src/db/seed.ts): real Pakistani data — "VibeRent Mobility" agency, 4 branches (Lahore Gulberg, Islamabad Blue Area, Rawalpindi Saddar, Karachi Clifton), owners (Farhan Qureshi, Hassan Motors…), customers with realistic normalized CNICs/phones (Hamza Siddiqui, Areeba Khan…), 5 vehicles (Corolla/City/Sportage/Alto/Yaris with real plates), optional SEED_AUTH_EMAIL/PASSWORD bootstrap login. seed-historical-data.ts and check-booking-transaction.ts (transactional overlap test, run via npm run db:check) also exist.

3. Docs alignment
docs/DEVELOPMENT_TRACKER.md (26 Sep): says Milestone 1 (Fleet), frontend complete, backend "In progress" with auth as next blocker — outdated relative to the code

TODO.md (26 Sep): frontend marked done; backend foundation done (T-1101, T-1104); next tickets T-1102 (auth architecture — now effectively implemented with Better Auth instead of the recommended Auth.js), T-1103 (file storage), T-1105–T-1110 (audit logging breadth, private files, backups/monitoring, security review)

api_state.md (27 Sep): most accurate — 16 API capabilities "Complete"

docs/ROADMAP.md: currently in Milestone 8 — Pilot architecture and persistence; Milestone 9 = controlled agency pilot

docs/BACKLOG.md: no active ticket; Ready queue empty; huge Done list (T-001 → T-1104)

docs/DECISIONS.md: accepted D-001–D-007 (incl. D-007 SQLite+Drizzle); 12 open decisions (D-102 auth provider — code has moved ahead of this decision, D-103–D-112: tenancy enforcement, file storage, accounting boundary, deposits, pricing, holds, owner shares, taxes, comms providers, e-signature)

Phases.md: original roadmap doc; note it recommends PostgreSQL/Prisma/NextAuth — superseded by Backend.md/D-007

Gap to flag: docs say prototype/mock; code is ~80% DB-backed. CHANGELOG.md, tracker "Known gaps" (mutations reset on refresh), and BACKLOG need reconciliation.

4. Mock data — where it still lives
Realistic Pakistani fixtures (Lahore/Islamabad/Rawalpindi/Karachi, PKR, real name/plate patterns) in src/lib/: mock-data.ts (8 vehicles + today schedule), operations-data.ts (198 LOC — bookings/customers/expenses/owners), booking-data.ts, finance-data.ts, owner-statement-data.ts, vehicle-detail-data.ts (220 LOC).

Still consumed by: components/layout/command-palette.tsx (global search), components/vehicles/vehicle-workspace.tsx (detail tabs), components/bookings/rental-operation-dialogs.tsx (conflict check). Dead: operations-module.tsx, lib/repositories/booking-repository.ts.

5. Build/verify tooling (package.json)
dev / build / start (Next 16.3.6), lint (eslint 9 + eslint-config-next), typecheck (tsc --noEmit)

DB: db:generate, db:migrate, db:seed (tsx), db:check (transaction overlap test), db:studio

No test suite, no CI config. Env contract in .env.example: DATABASE_URL, BETTER_AUTH_URL/SECRET, RESEND_API_KEY, AUTH_EMAIL_FROM, optional SEED_AUTH_*.

Net summary: This is no longer a mock prototype — it's a working modular monolith with Better Auth + orgs/invitations, a 24-table agency-scoped SQLite schema, transactional booking/checkout/check-in services, and a 17-route /api/v1. Remaining mock surface: command palette, vehicle-detail tabs, rental-operation dialogs; remaining backend gaps per docs: private file storage, broad audit logging, backups/monitoring, security review.