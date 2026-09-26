# VibeRent Changelog

This file records product-development milestones rather than package-level release notes.

## Unreleased

### Added

- Communication-template presentation for booking, pickup, return, payment, and owner-statement messages with editable previews and explicit no-delivery boundary.
- Stakeholder release-readiness workspace and documented five-scenario walkthrough with a structured feedback log.
- Cross-product accessibility polish for settings tabs and icon-only dialog close controls, plus a recorded frontend QA completion run.

- Owner statement calculation fixtures with agreement-version source lines, draft review, approval/void/adjustment actions, full/partial payouts, and reconciliation checks.
- Settings workspace for agency identity, branches/cities, booking/deposit/document policies, expense/extras/vendor catalogs, and user-role presentation.
- Explicit production boundary messaging around account creation, authentication, authorization, and branch enforcement.

- Handover photo simulation, checkout review, active-rental extension, and three-step return inspection with charge, deposit, and disposition review.
- Immutable payment/deposit transaction fixtures, booking receipts, compensating reversals/write-offs, and an aged outstanding-balances view.
- Expense allocation form with simulated receipt plus Draft, Submitted, Approved, Rejected, and Reversed lifecycle actions.
- Reconciliable Vehicle P&L, revenue/collections, utilization, expense, and owner reports with source drill-down and filtered CSV export.

- Customer document/license health and reversible blacklist history.
- Owner create/edit/detail, managed-vehicle links, agreement terms, and effective-dated version history.
- Typed booking/availability fixtures, repository contract, and half-open interval overlap checking.
- Booking detail actions, fleet timeline, five-step creation, session draft recovery, amendment, cancellation/no-show, and manual availability blocks.
- Checkout readiness plus odometer, fuel, accessories, condition, and acceptance capture.

- Next.js App Router frontend foundation.
- Responsive application shell and navigation.
- Reference-led VibeRent dashboard with operational metrics, pickups/returns, vehicle imagery, quick actions, and recent activity.
- Initial Vehicles list and form prototype with search, filters, sorting, pagination, add/edit/details, and delete confirmation.
- Shared UI primitives for buttons, page headers, tables, filters, status badges, dialogs, forms, action menus, and empty states.
- Typed mock repository boundary for Vehicles with asynchronous list/save/remove behavior and case-insensitive plate conflict validation.
- Shared loading skeleton and retryable inline error treatments, plus pending feedback for vehicle mutations.
- URL-addressable vehicle detail workspace with operational metrics, document health, bookings, expenses, maintenance, activity timeline, and in-context editing.
- Controlled vehicle status transitions with operational reasons, conflict guidance, and timeline history.
- Vehicle media and document register with verification metadata, expiry warnings, and simulated upload feedback.
- Responsive Bookings, Customers, Expenses, Reports, and Owners modules with deterministic local data, summaries, filters, status treatments, and working prototype feedback.
- Managed-vehicle owner agreements, shareable fleet filter/sort/page URLs, linked state previews, and reusable detail/timeline/loading/error patterns.
- Keyboard-accessible global command palette with module and record search across vehicles, bookings, and customers.
- Accessible shared feedback and route recovery, reversible vehicle archiving, guarded forms, fleet maintenance/transfer/rate workflows, and customer CRUD/duplicate/detail experiences.
- Detailed product and development documentation under `docs/`.

### Known limitations

- Data is deterministic and client-local; refresh resets mutations.
- Most non-dashboard/non-vehicle routes are planned-state screens.
- Authentication, persistence, file upload, notifications, payments, and exports are not implemented.
