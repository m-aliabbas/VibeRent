# VibeRent API state

Last reviewed: 2026-09-27

This file tracks the focused mobile/field-operations contract defined in `Backend.md`. “Complete” means the route authenticates, validates input, enforces agency scope and roles in its service, and uses the shared API response envelope.

## Complete

| Resource | Method and path | Capability |
| --- | --- | --- |
| Session | `GET /api/v1/session` | Current staff user, agency, role, and active branches |
| Today | `GET /api/v1/operations/today?date=YYYY-MM-DD` | Pickups and returns for a Pakistan-local calendar day |
| Vehicles | `GET /api/v1/vehicles` | Tenant-scoped fleet list |
| Vehicles | `POST /api/v1/vehicles` | Create a vehicle and audit the change |
| Vehicles | `GET /api/v1/vehicles/:id` | Vehicle detail |
| Vehicles | `PATCH /api/v1/vehicles/:id` | Update a vehicle and audit the change |
| Availability | `GET /api/v1/vehicles/availability?pickupAt=...&returnAt=...` | Half-open interval availability search across bookings and blocks |
| Bookings | `GET /api/v1/bookings` | Tenant-scoped booking list with financial totals |
| Bookings | `POST /api/v1/bookings` | Confirm a priced booking in an immediate transaction |
| Bookings | `GET /api/v1/bookings/:id` | Booking detail and inspection history |
| Rental operations | `POST /api/v1/bookings/:id/checkout` | Atomic check-out inspection, lifecycle transition, vehicle update, and audit event |
| Rental operations | `POST /api/v1/bookings/:id/checkin` | Atomic check-in inspection, odometer check, lifecycle transition, vehicle update, and audit event |
| Customers | `GET /api/v1/customers` | Tenant-scoped customer lookup with masked CNIC |
| Customers | `POST /api/v1/customers` | Create a customer with normalized identity fields and audit event |
| Customers | `GET /api/v1/customers/:id` | Customer detail with masked CNIC |
| Expenses | `GET /api/v1/expenses` | Tenant-scoped expense list |
| Expenses | `POST /api/v1/expenses` | Submit an expense with scoped reference checks and audit event |
| Activity | `GET /api/v1/activity?before=...&limit=...` | Cursor-based audit/activity feed |
| Desktop operations | `GET /api/v1/backups/status` | Owner-only license, scheduler, local backup, and Google Drive status |
| Backups | `POST /api/v1/backups/create` | SQLite-safe database and private-file archive with optional Drive upload |
| Backups | `GET /api/v1/backups/download/:filename` | Owner-only local backup download |
| Backups | `POST /api/v1/backups/restore` | Validate and stage a local archive for restart-only restore |
| Google Drive | `POST /api/v1/backups/google-drive/connect` | Begin limited-scope desktop OAuth |
| Google Drive | `GET /api/v1/backups/google-drive/callback` | Complete OAuth using a short-lived state value |
| Google Drive | `GET /api/v1/backups/google-drive/files` | List VibeRent-created backup archives |
| Google Drive | `POST /api/v1/backups/google-drive/upload` | Create and upload a fresh archive |
| Google Drive | `POST /api/v1/backups/google-drive/restore/:id` | Download, validate, and stage a Drive archive for restart-only restore |

## Pending by an explicit product or infrastructure decision

| Resource | Planned capability | Why pending |
| --- | --- | --- |
| Cloud uploads | Authorize upload, finalize metadata, and issue signed downloads | The local desktop pilot keeps private files in the OS application-data directory and includes them in recovery archives. A hosted/mobile deployment still requires private object storage. |
| Mobile authentication | Short-lived access tokens, refresh rotation, revocation, and device sessions | Web authentication now uses Better Auth secure cookie sessions. A native-token contract remains intentionally separate. |
| Rate limiting | Login, lookup, mutation, upload, and export limits | Requires the deployment/runtime decision and a shared limiter store. |

## Later backend phases (not part of the initial field API)

- Payment posting, refund/reversal, reconciliation, and owner payouts belong to Phase B3 and require explicit idempotency contracts.
- Owner administration, reports, configuration, and bulk administration remain web-first until a mobile use case is approved.
- OpenAPI publication is planned when the first mobile client begins development and the `v1` contract is frozen.

## Contract conventions

- Authentication: secure Better Auth session cookie for browser clients. Native bearer access remains pending the mobile phase.
- Success: `{ "data": ..., "meta": { "requestId": "req_..." } }`.
- Failure: `{ "error": { "code": "...", "message": "...", "fieldErrors": {}, "requestId": "req_..." } }`.
- Mutation bodies must use `Content-Type: application/json`.
- Money is represented as whole PKR integers in the current product data.
- Dates and timestamps use ISO 8601; booking intervals are half-open (`[pickupAt, returnAt)`).
