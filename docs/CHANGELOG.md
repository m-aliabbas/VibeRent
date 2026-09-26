# VibeRent Changelog

This file records product-development milestones rather than package-level release notes.

## Unreleased

### Added

- Next.js App Router frontend foundation.
- Responsive application shell and navigation.
- Reference-led VibeRent dashboard with operational metrics, pickups/returns, vehicle imagery, quick actions, and recent activity.
- Initial Vehicles list and form prototype with search, filters, sorting, pagination, add/edit/details, and delete confirmation.
- Shared UI primitives for buttons, page headers, tables, filters, status badges, dialogs, forms, action menus, and empty states.
- Detailed product and development documentation under `docs/`.

### Known limitations

- Data is deterministic and client-local; refresh resets mutations.
- Most non-dashboard/non-vehicle routes are planned-state screens.
- Authentication, persistence, file upload, notifications, payments, and exports are not implemented.

