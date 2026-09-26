# VibeRent Changelog

This file records product-development milestones rather than package-level release notes.

## Unreleased

### Added

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
- Detailed product and development documentation under `docs/`.

### Known limitations

- Data is deterministic and client-local; refresh resets mutations.
- Most non-dashboard/non-vehicle routes are planned-state screens.
- Authentication, persistence, file upload, notifications, payments, and exports are not implemented.
