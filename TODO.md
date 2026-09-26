# VibeRent — Done and Next Tasks

Last updated: 26 September 2026

## Current status

The frontend prototype is feature-complete and navigable. The SQLite pilot-backend foundation is established, but the application is **not ready for real customer data or production use** until authentication, authorization, private-file security, backups, monitoring, and the final security review are complete.

## Done

### Frontend application

- [x] Responsive application shell, mobile navigation, dashboard, command search, feedback, loading, error, empty, and confirmation states.
- [x] Vehicle CRUD, detail workspace, documents, status history, maintenance, transfers, rates, ownership agreements, archive/restore, and URL-backed filters.
- [x] Customer CRUD, duplicate detection, detail/history, documents, license health, warnings, and blacklist history.
- [x] Owner CRUD, managed vehicles, versioned agreements, statements, adjustments, payouts, and reconciliation.
- [x] Booking list, detail, availability calendar, creation wizard, conflict recovery, amendments, cancellation/no-show, and manual blocks.
- [x] Checkout, simulated handover photos, extensions, return comparison, extra charges, deposit review, and post-return disposition.
- [x] Payment/deposit ledger, receipts, reversals, write-offs, and outstanding balances.
- [x] Expense allocation, simulated receipts, submission, approval, rejection, and reversal.
- [x] Vehicle P&L, collections, utilization, expense, owner reports, source drill-down, and CSV export.
- [x] Agency, branch, policy, catalog, role, communication-template, and release-readiness settings.
- [x] Stakeholder walkthrough scenarios, feedback log, and source-level accessibility/responsive review.

### SQLite backend foundation

- [x] **T-1101** Selected SQLite + Drizzle ORM with a shared, agency-keyed schema.
- [x] Documented the single-instance SQLite deployment boundary.
- [x] Enabled WAL mode, foreign keys, and a five-second busy timeout.
- [x] Added 13 operational tables with tenant, branch, interval, and lookup indexes.
- [x] **T-1104** Added generated SQL migration and deterministic seed data.
- [x] Added an immediate transaction that rejects overlapping booking confirmations.
- [x] Added database scripts: `db:generate`, `db:migrate`, `db:seed`, `db:check`, and `db:studio`.
- [x] Verified migration generation, seeding, WAL mode, and overlap rejection.

### Quality checks completed

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm audit --omit=dev` — no production dependency vulnerabilities.
- [x] Primary and representative detail routes return HTTP 200.

## Next tasks — required order

### 1. Architecture decisions

- [ ] **T-1102 — Approve authentication and authorization architecture.**
  - Recommended: Auth.js with locally managed agency accounts for the SQLite/local-first deployment.
  - Decide password recovery, session duration, MFA roadmap, and initial agency-owner bootstrap.
  - Define Agency Owner, Fleet Manager, Rental Agent, and Accountant permissions.
  - Define branch-scoped access and cross-agency denial behavior.
- [ ] **T-1103 — Approve private-file storage and security architecture.**
  - Choose local encrypted storage or a private S3-compatible provider.
  - Define signed-access lifetime, malware scanning, allowed file types, size limits, retention, and deletion.

### 2. Core backend implementation

- [ ] **T-1105 — Implement authentication, agency membership, and roles.**
  - Add sign-in/sign-out and secure password/session handling.
  - Resolve agency and branch scope on every request.
  - Enforce authorization server-side; UI visibility alone is insufficient.
  - Add automated cross-agency and cross-branch access tests.
- [ ] **T-1106 — Connect transactional availability and booking confirmation.**
  - Expose the existing SQLite transaction through an authenticated server action or route handler.
  - Replace client-only booking confirmation and calendar fixtures with database queries.
  - Preserve draft data when the final conflict check fails.
  - Add concurrent confirmation tests.
- [ ] **T-1107 — Implement server-side audit logging.**
  - Record actor, agency, action, entity, timestamp, and safe metadata.
  - Cover booking/status changes, payments, expenses, statements, payouts, restrictions, files, settings, and role changes.
  - Prevent secrets and full identity values from entering logs.
- [ ] **T-1108 — Implement private-file handling.**
  - Secure customer and vehicle documents, receipts, and inspection photos.
  - Enforce agency/role scope before upload, view, or deletion.
  - Use non-public storage keys and short-lived access.

### 3. Operations and release gate

- [ ] **T-1109 — Monitoring, backups, restore test, and runbook.**
  - Back up the SQLite database and private files consistently.
  - Define recovery objectives and perform a documented restore test.
  - Add application error monitoring, health checks, storage alerts, and incident ownership.
- [ ] **T-1110 — Security, privacy, performance, and data-integrity review.**
  - Run authorization, tenant-isolation, concurrency, file-access, and audit-log tests.
  - Review CNIC/license masking, retention, deletion, and backup handling.
  - Load-test representative booking and report workflows.
  - Complete interactive QA at 390px and 1440px, including browser-console inspection.

## Known constraints

- SQLite supports one writable VibeRent application instance using durable local storage.
- Do not put the SQLite database on a shared network filesystem.
- Horizontal application scaling requires migration to a server database.
- Current UI mutations and uploaded-file experiences remain prototype-local until the backend routes are connected.
- The development-only Drizzle migration tool currently reports moderate transitive `esbuild` advisories; production dependencies audit clean.

## Production-ready definition

VibeRent is ready for real use only when every `T-1102`–`T-1110` item above is complete, automated tenant/authorization tests pass, backup restoration has been demonstrated, and the final release review is signed off.
