# VibeRent Backlog

## How to use this file

- Move only refined work into `Ready`.
- One ticket should produce a reviewable outcome.
- Every ticket references features/flows and includes acceptance checks.
- Update status here and summarize progress in `DEVELOPMENT_TRACKER.md`.

## Active board

### In progress

No active ticket is recorded. Move the next refined ticket here when implementation begins.

### Ready

| Ticket | Description | Requirement | Dependencies |
| --- | --- | --- | --- |

### Done

| Ticket | Description | Requirement | Evidence |
| --- | --- | --- | --- |
| T-001 | Bootstrap Next.js/TypeScript/Tailwind frontend | F-SHL-01 | Build, lint, typecheck passed |
| T-002 | Implement shell, redesigned dashboard, and initial Vehicles CRUD prototype | F-SHL-01, F-DSH-01–04, F-VEH-01–02 | Browser-tested desktop/mobile |
| T-003 | Complete product planning and tracking documentation | Product-wide | Documentation index, feature catalog, flows, rules, data model, roadmap, backlog, tracker, QA, decisions, and changelog |
| T-101 | Create mock repository interfaces for vehicles and shared async states | F-PLT-01, F-VEH-01 | Typed repository/result contract, async Vehicles CRUD, loading/error patterns, duplicate-plate validation, responsive browser QA |
| T-102 | Build full vehicle detail workspace with tabs and actions | F-VEH-03 | URL-addressable overview, record tabs, edit action, loading/error recovery, desktop/mobile browser QA |
| T-103 | Add vehicle status transition dialog and history | F-VEH-05, FL-VEH-03 | Valid next states, required reasons, conflict guidance, repository save, and timeline history; responsive browser QA |
| T-104 | Add photo/document prototype states and expiry warnings | F-VEH-04 | Media preview, document register, verification/expiry states, simulated uploads, and responsive browser QA |
| T-105 | Add managed ownership owner selector and agreement summary | F-VEH-02, FL-VEH-02 | Owner selection, effective dates, share terms, expense responsibility, payout frequency, and detail snapshot |
| T-106 | Make vehicle filters and pagination URL-addressable | F-VEH-01 | Search, filters, page, and sort restore from and synchronize to the URL |
| T-107 | Add vehicle loading, error, empty, and filtered-empty demos | F-PLT-01, F-VEH-01 | Linked prototype previews and retryable error state |
| T-108 | Run full Vehicles responsive/accessibility QA | F-PLT-02 | Desktop/390px workflow, focus, overflow, and console checks passed |

## E-100 — Foundation and shared UX

- [x] **T-001** Bootstrap application and quality scripts.
- [x] **T-002** Responsive shell and initial primary screens.
- [x] **T-109** Add shared skeleton/loading pattern.
- [x] **T-110** Add shared inline error and retry pattern.
- [x] **T-111** Add reusable detail-page/timeline layout.
- [x] **T-112** Add global command/search palette prototype.
- [x] **T-113** Standardize toast/feedback behavior and screen-reader announcements.
- [x] **T-114** Add route-level not-found and error experiences.

## E-200 — Vehicles

- [x] **T-201** Repository-backed vehicle list with simulated latency/error.
- [x] **T-202** Vehicle detail overview and operational summary.
- [x] **T-203** Booking, expense, maintenance, and activity tabs.
- [x] **T-204** Create/edit route or route-aware dialog with unsaved-change guard.
- [x] **T-205** Managed vehicle fields and agreement snapshot.
- [x] **T-206** Status transition rules and confirmation.
- [x] **T-207** Archive/restore instead of destructive history removal.
- [x] **T-208** Photo gallery and document metadata prototype.
- [x] **T-209** Document expiry badges and dashboard exception.
- [x] **T-210** Maintenance case create/schedule prototype.
- [x] **T-211** City transfer workflow.
- [x] **T-212** Rate card summary/editor prototype.

## E-300 — Customers

- [x] **T-301** Typed customer fixtures.
- [x] **T-302** Customer list/search/status filter and mobile records.
- [x] **T-303** Customer create/edit with normalized phone/CNIC validation.
- [x] **T-304** Duplicate candidate experience.
- [x] **T-305** Customer detail, balance, and rental history.
- [x] **T-306** Document and license status prototype.
- [x] **T-307** Warning/blacklist workflow with history.

## E-400 — Owners and agreements

- [x] **T-401** Owner list, filters, and summary balances.
- [x] **T-402** Owner create/edit/detail.
- [x] **T-403** Management agreement terms editor.
- [x] **T-404** Versioned agreement history UI.
- [x] **T-405** Link managed vehicles to active agreement.

## E-500 — Availability and bookings

- [x] **T-501** Booking/availability typed repositories and overlap utility.
- [x] **T-502** Booking list, status filters, and mobile records.
- [x] **T-503** Booking detail with context actions.
- [x] **T-504** Fleet day/week/month timeline.
- [x] **T-505** Booking wizard: schedule step.
- [x] **T-506** Booking wizard: vehicle availability step.
- [x] **T-507** Booking wizard: customer step with inline create.
- [x] **T-508** Booking wizard: pricing and deposit step.
- [x] **T-509** Booking wizard: review, final conflict check, and confirmation.
- [x] **T-510** Draft preservation and conflict recovery.
- [x] **T-511** Amend/reassign booking flow.
- [x] **T-512** Cancel/no-show flow and refund task state.
- [x] **T-513** Manual availability blocks.

## E-600 — Checkout and return

- [x] **T-601** Checkout precondition summary.
- [x] **T-602** Odometer/fuel/accessory/condition form.
- [x] **T-603** Simulated handover photo capture/gallery.
- [x] **T-604** Checkout review and state transition.
- [x] **T-605** Active rental extension workflow.
- [x] **T-606** Check-in comparison and validation.
- [x] **T-607** Late/distance/fuel/damage charge calculation.
- [x] **T-608** Deposit application and final balance review.
- [x] **T-609** Post-return vehicle disposition.

## E-700 — Payments and expenses

- [x] **T-701** Payment transaction model and booking balance calculation.
- [x] **T-702** Record payment dialog and receipt view.
- [x] **T-703** Deposit receive/apply/refund/forfeit flow.
- [x] **T-704** Reversal and write-off workflow.
- [x] **T-705** Outstanding balances list.
- [x] **T-706** Expense fixtures, list, and filters.
- [x] **T-707** Expense form with allocations and simulated receipt.
- [x] **T-708** Expense submit/approve/reject/reverse lifecycle.

## E-800 — Reports

- [x] **T-801** Shared report period filters and definitions.
- [x] **T-802** Vehicle P&L summary and source drill-down.
- [x] **T-803** Revenue versus collections report.
- [x] **T-804** Utilization report with downtime definition.
- [x] **T-805** Expense analysis.
- [x] **T-806** Owner performance/payable reports.
- [x] **T-807** CSV export prototype/production decision.

## E-900 — Owner statements and payouts

- [x] **T-901** Statement calculation fixture/service.
- [x] **T-902** Draft statement review and source drill-down.
- [x] **T-903** Approval/void/adjustment states.
- [x] **T-904** Full/partial payout recording.
- [x] **T-905** Owner balance reconciliation scenarios.

## E-1000 — Settings and prototype completion

- [x] **T-1001** Agency profile settings.
- [x] **T-1002** Branches/cities management.
- [x] **T-1003** Booking, pricing, deposit, and document policies.
- [x] **T-1004** Expense categories, extras, and vendors.
- [x] **T-1005** User/role presentation with production boundary notice.
- [x] **T-1006** Notification/communication template presentation.
- [x] **T-1007** Cross-product accessibility and responsive pass.
- [x] **T-1008** Stakeholder walkthrough scenarios and feedback log.

## E-1100 — Pilot backend (blocked on decisions)

- [x] **T-1101** Approve database/ORM and tenancy architecture.
- [ ] **T-1102** Approve authentication/authorization architecture.
- [ ] **T-1103** Approve file storage/security architecture.
- [x] **T-1104** Implement schema/migrations and seed strategy.
- [ ] **T-1105** Implement auth, agency membership, and roles.
- [ ] **T-1106** Implement transactional availability and booking confirmation.
- [ ] **T-1107** Implement server-side audit logging.
- [ ] **T-1108** Implement private file handling.
- [ ] **T-1109** Monitoring, backups, restore test, and runbook.
- [ ] **T-1110** Security, privacy, performance, and data-integrity release review.
