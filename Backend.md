# VibeRent Backend Plan

## 1. Decision summary

VibeRent will use a **Next.js modular monolith with SQLite and Drizzle ORM** for the current stage.

- Runtime: Next.js App Router on a Node.js runtime
- Database: SQLite through `better-sqlite3`
- ORM and migrations: Drizzle ORM and Drizzle Kit
- Web mutations: Server Actions where they improve the web workflow
- Shared/public interface: versioned Next.js Route Handlers under `/api/v1`
- Validation: shared server-side schemas at every input boundary
- Files: local placeholders during prototyping; private object storage when uploads go live
- Mobile: a future client of `/api/v1`, not a second implementation of business rules

SQLite is an intentional current-stage choice, not an assumption that it will serve every future scale. PostgreSQL, Prisma, Supabase, and a separate NestJS service are out of scope unless the user explicitly changes the decision or an agreed migration trigger is reached.

## 2. Goals

The backend should:

1. Support the web dashboard without duplicating domain logic in UI components.
2. Preserve a clean path to a future iOS/Android application.
3. Enforce multi-agency and role boundaries consistently.
4. Protect booking availability and financial workflows with transactions.
5. Keep database and hosting choices replaceable behind stable interfaces.
6. Start simply enough for the current prototype while avoiding disposable architecture.

## 3. Non-goals for the current stage

- Building the mobile application now
- Creating microservices
- Adding GraphQL merely for flexibility
- Supporting multiple active backend instances against the same SQLite file
- Implementing offline synchronization before mobile workflows are known
- Adding production payments, e-signatures, WhatsApp, SMS, or accounting integrations without a separate scoped decision
- Migrating to PostgreSQL preemptively

## 4. Architecture

```text
Web UI                         Future mobile app
  |                                  |
  | Server Actions                   | HTTPS / JSON
  |                                  |
  +----------> Application services <+---- /api/v1 Route Handlers
                         |
                   Domain rules
                         |
                    Repositories
                         |
                  Drizzle + SQLite

External integrations/webhooks ----> /api/v1 or dedicated webhook routes
Private files ----------------------> object storage (when enabled)
```

The important boundary is the application service layer. A booking created from the web and one created from mobile must execute the same validation, authorization, availability, pricing, transaction, and audit logic.

### Layer responsibilities

#### Presentation

- React Server and Client Components render the web experience.
- Presentation code formats view data but does not decide pricing, permissions, availability, payouts, or lifecycle transitions.

#### Server Actions

- Serve web-only mutations and form workflows.
- Authenticate, parse input, call an application service, and translate its result into UI feedback.
- Must not contain business rules that the mobile API would need.

#### Route Handlers

- Provide the future mobile interface, webhooks, integrations, downloads, and other public HTTP endpoints.
- Live under `/api/v1` unless a provider requires a dedicated callback path.
- Authenticate, validate, call an application service, and serialize a DTO.
- Never expose Drizzle records or database exceptions directly.

#### Application/domain services

- Own use cases such as `createBooking`, `confirmBooking`, `checkOutRental`, `checkInRental`, `postPayment`, `recordExpense`, and `createOwnerPayout`.
- Enforce agency scope, permissions, lifecycle transitions, invariants, and transaction boundaries.
- Accept explicit actor and tenant context rather than reading UI state.

#### Repositories

- Encapsulate data access and query construction.
- Always require agency scope for tenant-owned data.
- Return domain records or DTO inputs, not UI-specific objects.
- Keep SQLite-specific queries localized so PostgreSQL can replace them later.

#### Database

- Enforces foreign keys, unique constraints, required fields, indexes, and safe transaction boundaries.
- Stores canonical operational and financial records.
- Does not store binary uploads directly.

## 5. Recommended source structure

Adopt this structure incrementally; do not move working files only to make the tree match the document.

```text
src/
  app/
    api/
      v1/
        auth/
        vehicles/
        bookings/
        customers/
        expenses/
        owners/
        reports/
        uploads/
  server/
    auth/
      session.ts
      authorize.ts
    context/
      request-context.ts
    services/
      booking-service.ts
      vehicle-service.ts
      customer-service.ts
      expense-service.ts
      owner-service.ts
    repositories/
      contracts.ts
      drizzle/
    api/
      errors.ts
      response.ts
      pagination.ts
    validation/
    storage/
    audit/
  db/
    connection.ts
    schema.ts
    migrations/
  types/
    api/
```

Existing repositories and `src/db/booking-service.ts` should be moved or adapted only when the corresponding backend work is actively implemented.

## 6. SQLite operating rules

SQLite is appropriate while VibeRent runs as a prototype or a small, single-instance installation.

Required settings and practices:

- Keep `journal_mode = WAL`.
- Keep foreign-key enforcement enabled.
- Set a bounded busy timeout and treat lock contention as a retryable operational error.
- Run schema changes only through committed Drizzle migrations.
- Store the database on a persistent local volume with restricted permissions.
- Back up using a SQLite-safe backup method; do not copy an actively written file casually.
- Test backup restoration, not only backup creation.
- Run `PRAGMA integrity_check` as part of periodic maintenance.
- Keep transactions short and never perform network calls inside a write transaction.
- Use integer minor units for PKR amounts. For example, `1250000` represents PKR 12,500.00 if paisa precision is required. If the product intentionally uses whole rupees, document that choice and keep it consistent.
- Store timestamps as normalized UTC ISO 8601 strings and convert to `Asia/Karachi` only at presentation boundaries.

### Deployment constraint

The production process must have one writable application instance connected to one persistent SQLite file. Serverless or horizontally scaled deployments with an ephemeral local filesystem are not valid for this architecture.

If an early hosted pilot is required while retaining SQLite, deploy a long-running Node.js process on a host with a persistent volume, health checks, backups, and TLS termination.

## 7. Tenancy, identity, and authorization

VibeRent is multi-tenant even if the first pilot has one agency.

### Request context

Every protected operation receives a trusted context similar to:

```ts
type RequestContext = {
  requestId: string;
  userId: string;
  agencyId: string;
  branchId?: string;
  roles: Array<"agency_owner" | "fleet_manager" | "rental_agent" | "accountant">;
};
```

The server derives this context from the authenticated session or access token. Clients cannot select their own agency or grant themselves a role.

### Authorization rules

- Authentication is checked at every protected Server Action and Route Handler.
- Application services enforce permissions; hiding a button is never sufficient.
- Every tenant-owned repository query includes `agencyId`.
- Branch-restricted users only access authorized branches.
- Owners eventually receive a separate constrained portal role rather than reusing internal staff privileges.
- Sensitive reads and all mutations generate audit events with actor, agency, action, entity, time, and safe metadata.

### Mobile authentication direction

Choose the production authentication provider when authentication work begins. It must support short-lived access tokens, refresh-token rotation, revocation, and secure native-client flows. Mobile tokens must be stored in the platform keychain/keystore, never plain local storage.

The provider must remain behind the request-context adapter so domain services are not coupled to one authentication vendor.

## 8. API contract for the future mobile app

### Conventions

- Base path: `/api/v1`
- Transport: HTTPS JSON
- Naming: consistent camelCase JSON fields
- Dates/times: ISO 8601 with offsets or UTC `Z`
- Money: integer minor units plus an explicit currency
- IDs: opaque stable strings; clients must not infer meaning from them
- Pagination: cursor-based for activity feeds and growing lists; bounded page sizes
- Filtering: explicit query parameters with allow-listed values
- Mutations: support an idempotency key for operations that must not be duplicated
- Concurrency: expose a version or `updatedAt` value for conflict detection where mobile edits can race
- Compatibility: additive changes within `v1`; breaking changes require a new API version

### Successful response shape

```json
{
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

### Error response shape

```json
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "The vehicle is no longer available for the selected period.",
    "fieldErrors": {},
    "requestId": "req_..."
  }
}
```

Use stable machine-readable codes such as:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `VALIDATION_FAILED`
- `NOT_FOUND`
- `VERSION_CONFLICT`
- `BOOKING_CONFLICT`
- `INVALID_STATUS_TRANSITION`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

### Initial mobile-facing resources

The first mobile API should focus on field operations rather than mirror every dashboard screen:

1. Session and current user
2. Today’s pickups and returns
3. Vehicle search and availability
4. Booking detail and creation
5. Customer lookup and creation
6. Check-out and check-in
7. Condition photos and document uploads
8. Expense capture with receipt
9. Notifications or activity feed

Reports, configuration, role management, and bulk administration can remain web-only until a real mobile requirement exists.

## 9. Domain and data plan

### Foundation entities

- Agency
- Branch
- User and membership/role
- Audit event
- Private file metadata

### Fleet

- Vehicle
- Vehicle owner
- Management agreement with versioned effective dates
- Rate card and rate-rule snapshot
- Availability block
- Vehicle document and expiry
- Odometer and condition records

### Rental operations

- Customer
- Booking/rental
- Booking line or price breakdown
- Check-out record
- Check-in record
- Condition report and photos
- Charge and discount
- Contract metadata

### Finance

- Financial transaction
- Payment allocation
- Refund/reversal linked to the original transaction
- Expense and receipt
- Owner statement
- Owner payout and payout allocation

### Core invariants

- A vehicle cannot have overlapping active bookings or availability blocks.
- Booking dates use half-open ranges: `[pickupAt, returnAt)`.
- A managed vehicle references the agreement effective for the relevant earning period.
- Confirmed prices are stored as a snapshot; historical totals never depend on a mutable current rate card.
- Booking status changes follow an explicit transition map.
- Posted financial records are reversed or adjusted, not silently overwritten or deleted.
- Payouts and refunds are idempotent.
- Archived operational records remain available for historical reporting.
- All important state transitions append an audit event in the same transaction.

### Booking concurrency with SQLite

Booking confirmation must execute in a short immediate transaction:

1. Validate actor, tenant, customer, vehicle, interval, and requested transition.
2. Start an immediate write transaction.
3. Re-check overlapping active bookings and availability blocks.
4. Calculate or verify the authoritative price on the server.
5. Insert the booking and price snapshot.
6. Insert the audit event.
7. Commit.

The existing `confirmBooking` function demonstrates this direction. It should evolve behind a service and repository contract rather than become an API-specific implementation.

## 10. File upload plan

Do not place image or PDF blobs in SQLite.

When uploads become live:

1. The client requests upload authorization from the backend.
2. The backend verifies agency, role, entity, file type, and size.
3. The client uploads to private object storage.
4. The backend records sanitized metadata in `private_files`.
5. Downloads use short-lived signed URLs or an authorized streaming endpoint.

Separate storage prefixes by agency and classification. Treat CNIC images, licenses, contracts, and payment documents as sensitive. Remove location metadata from condition photos where appropriate, scan risky file types, and never make the bucket public.

## 11. Offline and synchronization direction

Do not implement offline writes yet. Design the API so offline support remains possible:

- Stable IDs
- Idempotency keys for create/post operations
- `updatedAt` or version fields for optimistic concurrency
- Tombstones or archive markers instead of hard deletion for synchronized records
- Incremental activity/sync endpoints based on a server cursor if later required
- Explicit conflict responses rather than last-write-wins for bookings and finance

For the first mobile release, prefer online operation with retryable requests and cached read-only data. Booking, payment, payout, and check-in/out writes should require confirmation from the server.

## 12. Security baseline

- Validate payloads, query parameters, path parameters, and uploaded-file metadata server-side.
- Authorize each resource and action within the agency and branch context.
- Rate-limit login, customer lookup, exports, uploads, and mutation endpoints.
- Use secure, HTTP-only cookies for the web; use bearer access tokens and secure refresh handling for native mobile.
- Keep secrets only in server environment variables.
- Hash passwords only through a proven authentication system; never implement custom password crypto.
- Redact CNIC, phone, token, and document details from logs.
- Apply strict size and type limits to request bodies and uploads.
- Return generic internal errors with a request ID; log safe diagnostic context server-side.
- Add CSRF protection where cookie-authenticated mutation endpoints require it.
- Define retention and deletion rules before storing real identity documents.

## 13. Observability and operations

Start with lightweight structured logging:

- Request ID
- Agency ID
- Actor ID
- Operation and entity ID
- Duration and outcome
- Safe error code

Do not log request bodies by default. Add error tracking before a production pilot. Track at least booking conflicts, transaction failures, database lock timeouts, upload failures, authentication failures, and backup outcomes.

Operational checks should cover:

- Liveness and readiness
- Database connection and migration version
- Writable persistent volume
- Recent successful backup
- SQLite integrity result
- Disk capacity

## 14. Testing strategy

### Unit tests

- Price calculation
- Date overlap behavior
- Status transition maps
- Permission decisions
- Owner-share calculations
- Money and date formatting helpers

### Integration tests with a temporary SQLite database

- Migrations apply from an empty database.
- Foreign keys and unique constraints reject invalid data.
- Booking transactions reject overlaps.
- Rollbacks leave no partial booking, payment, or audit data.
- Every tenant query rejects cross-agency access.
- Idempotency prevents duplicate payment and payout operations.

### API contract tests

- Authentication and authorization failures
- Validation and error shapes
- Pagination and filtering
- DTO stability
- Idempotency and version conflicts

### End-to-end tests

- Create customer and booking
- Confirm, check out, and check in rental
- Record payment and expense
- Produce owner statement
- Exercise the same service once through the web flow and once through `/api/v1`

Backend changes must also run the repository's lint, typecheck, build, migration, seed, and relevant transaction checks.

## 15. Delivery phases

### Phase B0 — Stabilize persistence

- Treat the existing SQLite/Drizzle schema as the starting point.
- Review identifiers, tenant columns, foreign keys, indexes, timestamps, and money units.
- Make migrations authoritative and ensure a clean database can migrate and seed.
- Create temporary-database integration test helpers.
- Document backup, restore, and local environment setup.

Exit criteria: a fresh database can migrate, seed, pass integrity checks, and run the booking conflict test reproducibly.

### Phase B1 — Service boundary

- Add request context, authorization helpers, validation, and typed domain errors.
- Define repository contracts for vehicles, customers, and bookings.
- Move booking rules into an application service shared by all entry points.
- Add transactional audit logging.

Exit criteria: UI or transport code contains no booking availability, pricing, tenancy, or status-transition logic.

### Phase B2 — Web persistence

- Replace mock repositories module by module, beginning with Vehicles.
- Continue with Customers and Owners, then Bookings and availability.
- Use Server Actions for web mutations while preserving UI loading, error, empty, and confirmation states.
- Keep fixture mode available for isolated visual development if useful.

Exit criteria: the core web booking flow persists through services and survives reloads without bypassing authorization or validation.

### Phase B3 — Financial operations

- Add immutable transaction, payment, refund, expense, statement, and payout workflows.
- Store price and agreement snapshots required for historical accuracy.
- Add reconciliation and audit coverage.

Exit criteria: financial totals can be reproduced from source records, and corrections use explicit reversal/adjustment flows.

### Phase B4 — Versioned API

- Introduce `/api/v1` response and error helpers.
- Expose the focused mobile resources listed above.
- Add access-token authentication, rate limits, idempotency, pagination, and contract tests.
- Publish a generated or maintained OpenAPI contract once mobile development begins.

Exit criteria: a non-browser test client can complete the intended mobile rental workflow through documented endpoints.

### Phase B5 — Files and documents

- Connect private object storage.
- Add authorized uploads, metadata, signed downloads, cleanup, and retention behavior.
- Implement condition photos, receipts, vehicle documents, and contracts in priority order.

Exit criteria: sensitive files remain private, tenant-isolated, auditable, and recoverable.

### Phase B6 — Mobile readiness

- Freeze the initial `v1` contract needed for mobile.
- Add device/session management and secure token rotation.
- Add conflict-aware retries and minimal read caching.
- Load-test the busiest workflows using realistic pilot traffic.
- Complete backup restoration and incident-response drills.

Exit criteria: mobile can launch without direct database access or duplicated business rules.

## 16. PostgreSQL reassessment triggers

Keeping SQLite now does not mean waiting for an outage before reconsidering it. Start a migration decision when one or more of these becomes real:

- More than one backend instance is required.
- SQLite write-lock contention appears under measured workload.
- Hosted mobile traffic creates sustained concurrent write pressure.
- The deployment platform cannot provide a reliable persistent volume and backup process.
- Reporting workloads interfere with operational writes.
- High availability, replicas, point-in-time recovery, or zero-downtime database maintenance becomes required.
- Database-enforced range/exclusion constraints become necessary for booking safety at scale.
- External integrations or workers need independent concurrent database access.

If migration is approved, preserve application services and repository contracts, add a PostgreSQL Drizzle implementation, migrate and reconcile data, dual-test critical workflows, and cut over through a documented maintenance plan. Do not change ORM and database simultaneously unless there is a separately justified reason.

## 17. Decisions that remain intentionally open

Decide these only when their implementation phase begins:

- Production authentication provider
- Native mobile framework
- Object-storage provider
- Job queue and scheduled-task provider
- Notification providers
- API documentation generator
- Exact pilot hosting provider
- Whether offline mutation support is truly required

Each choice should be recorded as a short architecture decision with context, options, decision, consequences, and reversal conditions.
