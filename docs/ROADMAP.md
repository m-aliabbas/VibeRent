# VibeRent Delivery Roadmap

The roadmap is dependency-driven rather than date-driven. A milestone is complete only when its exit criteria pass; estimated sessions are planning aids, not promises.

## Delivery strategy

1. Finish a coherent frontend prototype with deterministic mock repositories.
2. Validate operational flows with representative agency users.
3. Record architecture decisions before introducing persistence or authentication.
4. Implement backend capability in vertical slices rather than building an unused generic platform.
5. Pilot with controlled data and explicit recovery/support processes.

## Milestone 0 — Product foundation

**Objective:** Establish the design language, shared application shell, reusable interaction primitives, and planning source of truth.

Scope:

- Responsive shell, navigation, dashboard structure, and route system.
- Shared buttons, page headers, status badges, filters, data table, dialogs, empty states, and form controls.
- Typed mock data and formatting helpers.
- Product, feature, flow, domain, roadmap, backlog, tracking, QA, and decision documentation.

Exit criteria:

- Dashboard and Vehicles routes work at desktop and mobile widths.
- Lint, typecheck, and production build pass.
- No enabled dead controls on completed routes.
- Requirements have stable IDs and are traceable to tickets.

Current state: **In progress**. Shell, redesigned dashboard, shared primitives, and initial Vehicles workflow are implemented. Documentation is now established.

## Milestone 1 — Fleet reference implementation

**Objective:** Make Vehicles the complete pattern for later CRUD modules.

Scope:

- Vehicle list, detail, create/edit, archive/restore.
- Photos/documents simulated locally.
- Status transition workflow and history.
- Managed ownership and owner selection.
- Rates summary, maintenance summary, and booking history tabs.
- Loading, empty, filtered-empty, validation, conflict, and error states.
- URL-driven filters and detail/form routes or route-aware dialogs.

Dependencies: Milestone 0.

Exit criteria:

- `F-VEH-01` through `F-VEH-05` prototype acceptance criteria pass.
- CRUD behavior persists for the session through a mock repository abstraction.
- Shared patterns can be reused without copying feature-specific business rules.
- Vehicle workflow passes desktop/mobile/accessibility QA.

## Milestone 2 — Customers and Owners

**Objective:** Create the parties needed for real booking and managed-fleet workflows.

Scope:

- Customer list, create/edit, detail, history, restriction state, documents simulation.
- Owner directory, create/edit, detail, vehicle relationships.
- Management agreement editor and effective terms timeline.
- Duplicate warnings and sensitive-value masking presentation.

Dependencies: Milestone 1 form/list/detail patterns.

Exit criteria:

- Customer and Owner modules reuse shared primitives.
- Managed vehicle can link to a valid owner/agreement.
- Booking flow can consume customer and owner data without embedding fixtures in views.

## Milestone 3 — Availability and booking creation

**Objective:** Allow an agent to find a vehicle and create a conflict-free reservation.

Scope:

- Typed booking, availability block, and rate mock repositories.
- Booking list and booking detail.
- Availability search and fleet timeline.
- New booking wizard with customer selection/creation.
- Price breakdown, deposit requirement, review, and confirmation.
- Amend, cancel, and no-show prototype behavior.

Dependencies: Vehicles, Customers, rates, domain rules.

Exit criteria:

- `FL-BKG-01` completes on desktop and mobile.
- Overlap and invalid-date scenarios are blocked with recovery.
- Confirmed bookings immediately affect calendar/list availability.
- Price snapshot and balance are visible and consistent.

## Milestone 4 — Rental handover and return

**Objective:** Cover the operational lifecycle after booking confirmation.

Scope:

- Checkout checklist, odometer, fuel, accessories, notes, simulated photos.
- Active rental detail and extension.
- Check-in comparison and charge calculation.
- Damage/maintenance follow-up.
- Post-return vehicle status and final balance.

Dependencies: Confirmed bookings, customer documents, payment mock model.

Exit criteria:

- `FL-BKG-04` through `FL-BKG-06` work end to end.
- Invalid odometer/status transitions are blocked.
- Booking and vehicle states remain synchronized.
- Additional charge calculations are transparent.

## Milestone 5 — Expenses, payments, and financial visibility

**Objective:** Model cash movement and direct operating cost well enough to produce trustworthy prototype reports.

Scope:

- Payments, deposits, refunds, reversals, and balance view.
- Expense list, entry, receipt simulation, and approval state.
- Outstanding balances.
- Vehicle P&L, revenue, utilization, and expense reports.
- Drill-down from aggregates to source mock records.

Dependencies: Bookings and completed returns.

Exit criteria:

- Reports reconcile to visible transactions and expenses.
- Posted transaction correction uses reversal.
- Deposit and revenue presentation are distinct.
- Filtered-empty and export-unavailable states are explicit.

## Milestone 6 — Owner statements and payouts

**Objective:** Complete the managed-fleet financial workflow.

Scope:

- Agreement-aware revenue share.
- Owner statement generation, review, approval, and drill-down.
- Expense allocation and adjustments.
- Full/partial payout recording.
- Owner balance and performance reports.

Dependencies: Owners, agreements, completed bookings, expenses, transactions.

Exit criteria:

- `FL-OWN-01` completes and reconciles.
- Applicable agreement version is shown on each calculated line.
- Approved statements cannot be silently changed.

## Milestone 7 — Settings, polish, and prototype validation

**Objective:** Produce a complete, coherent frontend prototype ready for stakeholder validation.

Scope:

- Agency, branches, policies, rates, categories, extras, and template settings.
- Global search and attention center.
- Consistent loading/error/empty states across modules.
- Accessibility, responsive, performance, and content pass.
- Guided test scenarios and stakeholder feedback log.

Exit criteria:

- All top-level routes contain functional prototype workflows.
- Primary workflows pass `QA_CHECKLIST.md`.
- Known prototype limitations are documented.
- Stakeholders approve the pilot scope.

## Milestone 8 — Pilot architecture and persistence

**Objective:** Replace mock infrastructure with a secure, observable pilot backend.

Required decisions before start:

- Database/ORM, authentication, tenant strategy, file storage, hosting, email/notification provider, backup plan, monitoring, and privacy/retention policy.

Scope:

- Database schema and migrations.
- Authentication, agency membership, role and branch authorization.
- Server-side validation and transactional mutations.
- Private file storage and expiring access.
- Audit events, structured logging, monitoring, backups, and restore procedure.
- Seed/demo tenant and migration from prototype fixtures where appropriate.

Exit criteria:

- Tenant and authorization tests pass.
- Booking conflict prevention works under concurrent confirmation.
- Backup restoration is tested.
- Security/privacy review findings are resolved or accepted.

## Milestone 9 — Controlled agency pilot

**Objective:** Run real operations with one or two pilot agencies under support.

Scope:

- Data import and onboarding.
- Training material and operational runbook.
- Support/escalation process.
- Error and performance monitoring.
- Feedback-driven fixes; no uncontrolled scope expansion.

Exit criteria:

- Pilot agencies complete booking, checkout, return, expense, and reporting workflows.
- No unresolved data integrity or security issue.
- Success metrics and launch decision documented.

## Future milestones

- Production communications and WhatsApp integration.
- Digital agreement PDF and e-signature.
- Owner portal.
- Customer online booking widget.
- GPS/telematics.
- PWA/offline field workflow.
- Dynamic pricing and advanced accounting.

