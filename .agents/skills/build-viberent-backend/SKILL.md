---
name: build-viberent-backend
description: Build, extend, migrate, or debug VibeRent's backend using Next.js, TypeScript, Drizzle ORM, and SQLite, including schemas, migrations, repositories, application services, Server Actions, versioned Route Handlers, authentication and authorization boundaries, booking transactions, finance workflows, audit events, uploads, tests, and the future mobile API. Use for any request that changes backend persistence, database behavior, server-side business rules, or `/api/v1` contracts.
---

# Build VibeRent Backend

Implement production-shaped backend increments without prematurely replacing SQLite or splitting the application into services. Follow the repository `AGENTS.md` and read `Backend.md` completely before changing backend code.

## Required preparation

1. Inspect the current schema, migrations, connection setup, repositories, services, package versions, and relevant tests.
2. Read the relevant guide in `node_modules/next/dist/docs/` before using a Next.js server API. For mobile or integration endpoints, read the local Backend for Frontend and Route Handlers guides.
3. Identify the requested use case, actor, permissions, tenant and branch scope, state transition, transaction boundary, audit event, failure cases, and client consumers.
4. Preserve unrelated working-tree changes. Do not rewrite existing migrations that may already have been applied.

## Architecture boundary

Keep one modular monolith with this call direction:

```text
Server Action or /api/v1 Route Handler
  -> application/domain service
  -> repository contract
  -> Drizzle SQLite repository
```

- Put reusable business rules in application services, not components, Server Actions, or Route Handlers.
- Let the web and future mobile API call the same service for the same use case.
- Keep database access server-only and outside Client Components.
- Keep DTOs and API contracts independent of Drizzle row types.
- Add abstractions only for a demonstrated boundary or second consumer; do not build a generic framework speculatively.

## Implementation workflow

### 1. Define the contract

- Specify typed input, trusted `RequestContext`, result DTO, domain errors, and authorization requirements.
- Derive `userId`, `agencyId`, roles, and allowed branches from the trusted session or token. Never accept them as authoritative client input.
- Validate payloads at the server boundary and validate business invariants again in the service where necessary.
- Use stable error codes from `Backend.md` for public endpoints.

### 2. Evolve persistence safely

- Keep SQLite and Drizzle unless the user explicitly approves a migration.
- Change `src/db/schema.ts` and generate a committed Drizzle migration; do not rely on schema push for shared environments.
- Preserve foreign keys and add indexes for tenant, status, date-range, and lookup paths used by the feature.
- Represent PKR consistently as documented integer units and store normalized UTC timestamps.
- Require `agencyId` in every tenant-owned repository operation.
- Prefer archive markers, status transitions, reversals, or adjustments over destructive deletion of operational and financial history.

### 3. Implement the use case

- Enforce authorization, agency isolation, allowed status transitions, authoritative pricing, and current-record checks server-side.
- Wrap all dependent writes and their audit event in one short transaction.
- Never perform network calls or file uploads inside a SQLite write transaction.
- Use an immediate transaction for booking confirmation and re-check booking and availability-block overlap inside it.
- Make payments, refunds, payouts, webhooks, and retryable creates idempotent.
- Return domain results and errors rather than leaking SQLite or Drizzle exceptions.

### 4. Expose the minimum entry point

- Use a Server Action for a web-only mutation.
- Add a Route Handler under `/api/v1` when mobile, integration, webhook, download, or public HTTP access is part of the requirement.
- Do not make a Server Component fetch an internal Route Handler; call the service or repository directly on the server.
- Keep API responses, pagination, timestamps, money, concurrency fields, and error envelopes consistent with `Backend.md`.
- Avoid exposing internal database columns, sensitive identity data, private storage keys, or stack traces.

### 5. Connect the UI without leaking rules

- Reuse existing frontend components and preserve loading, validation, error, empty, and confirmation states.
- Keep optimistic UI subordinate to the authoritative server result for bookings, vehicle state, finance, and payouts.
- Update or invalidate affected views after successful mutations without inventing a second client-side source of truth.

## Domain guardrails

- Treat booking intervals as half-open: `[pickupAt, returnAt)`.
- Reject overlap with active bookings and availability blocks at confirmation time.
- Store confirmed rate and agreement snapshots so historical totals do not depend on mutable settings.
- Enforce booking and vehicle lifecycle transitions through explicit transition maps.
- Post audit events in the same transaction as important state changes.
- Reverse or adjust posted financial records; do not silently edit or delete them.
- Keep binary uploads out of SQLite. Store private file metadata only, with the bytes in private object storage when live uploads are implemented.
- Keep fixtures fictional and never seed real CNICs, phone numbers, documents, or credentials.

## SQLite constraints

- Preserve WAL mode, foreign-key enforcement, and the bounded busy timeout.
- Assume one writable backend instance and a persistent filesystem.
- Do not claim the current database works safely on an ephemeral serverless filesystem or across horizontally scaled instances.
- Keep transactions short, recognize lock contention, and return a controlled retryable failure where appropriate.
- If a request reaches a PostgreSQL reassessment trigger in `Backend.md`, report the evidence and migration option; do not migrate automatically.

## Testing and verification

Add the smallest credible tests at the correct layer:

- Unit tests for calculations, transitions, permissions, and pure domain rules.
- Temporary-SQLite integration tests for migrations, constraints, transactions, tenant isolation, overlap checks, rollback, and idempotency.
- Contract tests for `/api/v1` authentication, authorization, validation, DTOs, pagination, and error envelopes.
- End-to-end coverage for the changed operational workflow when practical.

Run the relevant available commands after implementation:

```bash
npm run lint
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:check
```

Do not run migration generation when no schema changed. Use a temporary database for destructive or repeatability checks; never overwrite the user's working database. Report exactly what ran, what passed, and any untested operational risk.

## Definition of done

- The requested workflow persists correctly through the shared service boundary.
- Server-side validation, authorization, tenant isolation, state transitions, and audit behavior are explicit.
- Multi-record writes are atomic and failure paths do not leave partial state.
- Web and `/api/v1` entry points do not duplicate domain logic.
- Schema changes have forward migrations and fresh-database coverage.
- Sensitive data and internal failures are not exposed.
- Relevant lint, typecheck, build, database, integration, and workflow checks pass, or precise pre-existing failures and coverage gaps are reported.
