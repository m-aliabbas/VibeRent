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
- [ ] **T-112** Add global command/search palette prototype.
- [ ] **T-113** Standardize toast/feedback behavior and screen-reader announcements.
- [ ] **T-114** Add route-level not-found and error experiences.

## E-200 — Vehicles

- [ ] **T-201** Repository-backed vehicle list with simulated latency/error.
- [x] **T-202** Vehicle detail overview and operational summary.
- [x] **T-203** Booking, expense, maintenance, and activity tabs.
- [ ] **T-204** Create/edit route or route-aware dialog with unsaved-change guard.
- [x] **T-205** Managed vehicle fields and agreement snapshot.
- [x] **T-206** Status transition rules and confirmation.
- [ ] **T-207** Archive/restore instead of destructive history removal.
- [x] **T-208** Photo gallery and document metadata prototype.
- [x] **T-209** Document expiry badges and dashboard exception.
- [ ] **T-210** Maintenance case create/complete prototype.
- [ ] **T-211** City transfer workflow.
- [ ] **T-212** Rate card summary/editor prototype.

## E-300 — Customers

- [x] **T-301** Typed customer fixtures.
- [x] **T-302** Customer list/search/status filter and mobile records.
- [ ] **T-303** Customer create/edit with normalized phone/CNIC validation.
- [ ] **T-304** Duplicate candidate experience.
- [ ] **T-305** Customer detail, balance, and rental history.
- [ ] **T-306** Document and license status prototype.
- [ ] **T-307** Warning/blacklist workflow with history.

## E-400 — Owners and agreements

- [x] **T-401** Owner list, filters, and summary balances.
- [ ] **T-402** Owner create/edit/detail.
- [ ] **T-403** Management agreement terms editor.
- [ ] **T-404** Versioned agreement history UI.
- [ ] **T-405** Link managed vehicles to active agreement.

## E-500 — Availability and bookings

- [ ] **T-501** Booking/availability typed repositories and overlap utility.
- [x] **T-502** Booking list, status filters, and mobile records.
- [ ] **T-503** Booking detail with context actions.
- [ ] **T-504** Fleet day/week/month timeline.
- [ ] **T-505** Booking wizard: schedule step.
- [ ] **T-506** Booking wizard: vehicle availability step.
- [ ] **T-507** Booking wizard: customer step with inline create.
- [ ] **T-508** Booking wizard: pricing and deposit step.
- [ ] **T-509** Booking wizard: review, final conflict check, and confirmation.
- [ ] **T-510** Draft preservation and conflict recovery.
- [ ] **T-511** Amend/reassign booking flow.
- [ ] **T-512** Cancel/no-show flow and refund task state.
- [ ] **T-513** Manual availability blocks.

## E-600 — Checkout and return

- [ ] **T-601** Checkout precondition summary.
- [ ] **T-602** Odometer/fuel/accessory/condition form.
- [ ] **T-603** Simulated handover photo capture/gallery.
- [ ] **T-604** Checkout review and state transition.
- [ ] **T-605** Active rental extension workflow.
- [ ] **T-606** Check-in comparison and validation.
- [ ] **T-607** Late/distance/fuel/damage charge calculation.
- [ ] **T-608** Deposit application and final balance review.
- [ ] **T-609** Post-return vehicle disposition.

## E-700 — Payments and expenses

- [ ] **T-701** Payment transaction model and booking balance calculation.
- [ ] **T-702** Record payment dialog and receipt view.
- [ ] **T-703** Deposit receive/apply/refund/forfeit flow.
- [ ] **T-704** Reversal and write-off workflow.
- [ ] **T-705** Outstanding balances list.
- [x] **T-706** Expense fixtures, list, and filters.
- [ ] **T-707** Expense form with allocations and simulated receipt.
- [ ] **T-708** Expense submit/approve/reject/reverse lifecycle.

## E-800 — Reports

- [x] **T-801** Shared report period filters and definitions.
- [ ] **T-802** Vehicle P&L summary and source drill-down.
- [ ] **T-803** Revenue versus collections report.
- [ ] **T-804** Utilization report with downtime definition.
- [ ] **T-805** Expense analysis.
- [ ] **T-806** Owner performance/payable reports.
- [ ] **T-807** CSV export prototype/production decision.

## E-900 — Owner statements and payouts

- [ ] **T-901** Statement calculation fixture/service.
- [ ] **T-902** Draft statement review and source drill-down.
- [ ] **T-903** Approval/void/adjustment states.
- [ ] **T-904** Full/partial payout recording.
- [ ] **T-905** Owner balance reconciliation scenarios.

## E-1000 — Settings and prototype completion

- [ ] **T-1001** Agency profile settings.
- [ ] **T-1002** Branches/cities management.
- [ ] **T-1003** Booking, pricing, deposit, and document policies.
- [ ] **T-1004** Expense categories, extras, and vendors.
- [ ] **T-1005** User/role presentation with production boundary notice.
- [ ] **T-1006** Notification/communication template presentation.
- [ ] **T-1007** Cross-product accessibility and responsive pass.
- [ ] **T-1008** Stakeholder walkthrough scenarios and feedback log.

## E-1100 — Pilot backend (blocked on decisions)

- [ ] **T-1101** Approve database/ORM and tenancy architecture.
- [ ] **T-1102** Approve authentication/authorization architecture.
- [ ] **T-1103** Approve file storage/security architecture.
- [ ] **T-1104** Implement schema/migrations and seed strategy.
- [ ] **T-1105** Implement auth, agency membership, and roles.
- [ ] **T-1106** Implement transactional availability and booking confirmation.
- [ ] **T-1107** Implement server-side audit logging.
- [ ] **T-1108** Implement private file handling.
- [ ] **T-1109** Monitoring, backups, restore test, and runbook.
- [ ] **T-1110** Security, privacy, performance, and data-integrity release review.
