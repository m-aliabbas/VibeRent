# VibeRent repository guide

## Product

VibeRent is a responsive car-rental operations dashboard for local agencies. It manages owned and owner-managed vehicles, bookings, customers, expenses, reports, and owner payouts. The current milestone is a convincing frontend prototype backed by realistic local mock data.

Read these source notes before changing product behavior or visual direction:

- `Backend.md` for backend boundaries, dual-database rules, API design, and the future mobile path.
- `Design2.md` for the agreed layout and design language.
- `UI.md` for screen-specific requirements.
- `Phases.md` for the larger product roadmap and domain scope.
- `ArchFocus.md` for the reuse-first component architecture.
- `Design.md` only for early naming and branding context; later documents take precedence.

If the notes conflict, use this priority: the user's latest request, `AGENTS.md`, `Backend.md` for backend decisions, `ArchFocus.md`, `Design2.md`, `UI.md`, `Phases.md`, then `Design.md`.

## Current scope

- Focus on frontend prototype work until the user explicitly asks for backend, database, or production authentication.
- Use deterministic mock data and client-side interactions for prototypes.
- Prefer one polished, navigable product experience over disconnected demo pages.
- Treat desktop and mobile as first-class. Agent workflows must remain practical on a phone.
- Do not invent integrations, API contracts, or persistence layers prematurely.

Backend planning is now documented in `Backend.md`. Backend implementation still requires an explicit user request; the plan does not expand the current implementation scope by itself.

## Default frontend stack

When bootstrapping the app, use Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui unless the user specifies otherwise. Use Lucide icons and a chart library only where data visualization adds real value. Keep business data and UI state typed.

The current persistence decision is **PostgreSQL for the hosted web build and SQLite for the Windows desktop build**, both through Drizzle ORM and the shared async database adapter. Do not replace Drizzle, introduce Supabase, or split out a separate backend service unless the user explicitly changes that decision. Keep database-specific code behind repositories/adapters so UI and domain workflows remain identical on both targets.

## Backend and API rules

- Treat the Next.js application as a modular monolith: UI, Route Handlers, domain services, repositories, and database access live in one deployable application for now.
- Put business rules in framework-independent domain/application services. Server Actions and Route Handlers must call the same services rather than reimplementing rules.
- Use Server Actions for web-only mutations. Use versioned Route Handlers under `/api/v1` for capabilities needed by the future mobile app, integrations, or webhooks.
- Never access Drizzle or `better-sqlite3` from Client Components. Keep database modules server-only.
- Validate every mutation at the server boundary. Authentication does not replace authorization; check agency membership, role, branch scope, and record ownership in the service layer.
- Scope every tenant-owned query by `agencyId`. Never trust an `agencyId`, role, price, total, or status supplied by a client without deriving or verifying it server-side.
- Keep API contracts DTO-based and independent of Drizzle row types. Use stable IDs, ISO 8601 timestamps, PKR minor units, explicit pagination, and structured error codes.
- Multi-record workflows such as booking confirmation, check-out, check-in, payment posting, and owner payout must be transactional and append audit events.
- Hosted web deployments must use PostgreSQL migrations from `drizzle-postgres/`, a managed connection URL, provider backups/PITR, and normal multi-instance deployment practices.
- Windows desktop remains SQLite. Use WAL mode, foreign keys, migrations, busy timeouts, tested backups, and one application instance per local database. Do not place the SQLite file on a network share.
- Per-agency web export/restore uses a validated portable SQLite package; it does not replace PostgreSQL platform backups.
- Store uploaded file metadata in the selected database, but keep actual photos, receipts, CNIC/license images, and signed contracts in private object storage for hosted web deployments.
- Never expose raw database errors, SQL, secrets, internal paths, CNIC values, or private storage keys in API responses or logs.

## Design direction

- Product name: VibeRent.
- Primary blue: `#006FE6`.
- Main text: `#19191F`.
- Surfaces: white with a restrained `#F8FAFC` app background.
- Use subtle borders and shadows, 12px card radii, clear hierarchy, and generous but efficient spacing.
- Aim for a professional operations tool, not a generic marketing page or a neon/glassmorphism dashboard.
- Use color semantically and always pair status colors with text.
- Populate screens with realistic Pakistani rental data (cities, names, plates, currency) unless the user requests another market.

## Architecture rules

- Build the app shell and shared primitives before duplicating feature UI.
- Use shared `PageHeader`, `DataTable`, `FilterBar`, `StatusBadge`, `ConfirmDialog`, `FormSection`, `EmptyState`, `LoadingState`, and `ActionMenu` patterns.
- Use shared form controls instead of hand-building inputs inside modules.
- Keep domain modules self-contained; make Vehicles the reference implementation for later CRUD modules.
- Keep business rules and mock repositories outside presentational components.
- Prefer composition over giant configurable components. Extract a shared abstraction after a pattern is demonstrated, not for hypothetical reuse.
- Preserve URL-addressable navigation and meaningful browser history even in a prototype.

## Interaction and quality bar

- Every visible control must either work or look clearly disabled with an explanation.
- Include useful loading, empty, error, filtered-empty, and confirmation states where relevant.
- Preserve keyboard focus, labels, contrast, touch targets, and reduced-motion behavior.
- Tables must adapt on small screens using deliberate column priority or card rows; do not rely on unusable horizontal overflow.
- Format dates, money, and percentages consistently. Default currency is PKR.
- Avoid destructive actions without confirmation.
- Do not add dependencies when an existing dependency or a small local utility is sufficient.

## Verification

After implementation, run the available lint, typecheck, and build commands. Exercise the changed route at desktop and mobile widths, check the browser console, and verify the main interaction path. Never claim a check passed unless it was run.

## Project skills

- Use `$build-viberent-frontend` for creating or extending prototype screens and shared frontend components.
- Use `$build-viberent-backend` for schemas, migrations, repositories, services, Server Actions, API routes, authentication boundaries, transactions, audit events, and backend tests.
- Use `$review-viberent-ui` for UI review, responsive QA, accessibility checks, and consistency audits.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
