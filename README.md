# VibeRent

## SQLite pilot database

The pilot uses SQLite in WAL mode through Drizzle ORM. It supports one deployed application instance with the database on durable local storage; do not place the database on a shared network filesystem or run multiple writers across app instances.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:check
```

Set `DATABASE_URL` to an absolute SQLite file path in deployment. The default local file is `.data/viberent.db` and is ignored by Git.

The backend is a Next.js modular monolith: Server Actions and `/api/v1` Route Handlers call the same application services, which enforce tenant scope and use server-only SQLite repositories. Vehicle changes and booking confirmations append audit events. Booking confirmation uses an immediate transaction and half-open intervals (`[pickupAt, returnAt)`).

## Authentication and organizations

VibeRent uses Better Auth with SQLite/Drizzle for verified email/password accounts, secure cookie sessions, password recovery, organizations, invitations, and custom staff roles. Copy `.env.example`, set a strong `BETTER_AUTH_SECRET`, and set the deployed `BETTER_AUTH_URL`.

```bash
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

In development, verification, reset, and invitation URLs are printed to the server terminal when Resend is not configured. Production requires `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM` sender.

Public signup creates a personal account. After email verification, the user creates a new agency and becomes its `agency_owner`. Existing agencies can only be joined through an invitation from their Users & Roles settings. Every protected Server Action and `/api/v1` route derives the user, agency, role, and branch scope from the authenticated session.

To connect the fictional seeded agency to a local test login without committing credentials, provide both variables only for the seed command:

```bash
SEED_AUTH_EMAIL=owner@example.test SEED_AUTH_PASSWORD='local-password-123' npm run db:seed
```

The maintained endpoint inventory, completion criteria, and intentionally deferred work live in [`api_state.md`](./api_state.md). Available field-operation endpoints include:

- `GET|POST /api/v1/vehicles`
- `GET|PATCH /api/v1/vehicles/:id`
- `GET|POST /api/v1/bookings`
- `GET /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/checkout`
- `POST /api/v1/bookings/:id/checkin`
- `GET|POST /api/v1/customers`
- `GET /api/v1/customers/:id`
- `GET /api/v1/vehicles/availability`
- `GET /api/v1/session`
- `GET /api/v1/operations/today`
- `GET|POST /api/v1/expenses`
- `GET /api/v1/activity`

API responses use consistent `{ data, meta }` and `{ error }` envelopes. Browser requests use the same secure session and application-service authorization as Server Actions. Native mobile access tokens remain a separate API phase.

VibeRent is a responsive car-rental operations system for Pakistani agencies managing owned and third-party vehicles. The current release is a frontend prototype using deterministic mock data.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality commands

```bash
npm run lint
npm run typecheck
npm run build
```

## Product and development documentation

Start with [docs/README.md](./docs/README.md). It links the product scope, detailed features, user flows, domain rules, data model, roadmap, backlog, development tracker, QA checklist, decisions, and changelog.

## Current prototype

- Responsive application shell and dashboard.
- Initial Vehicles list and CRUD interactions.
- Pakistani rental fixtures and PKR formatting.
- Planned-state routes for Bookings, Customers, Expenses, Reports, Owners, and Settings.

See [docs/DEVELOPMENT_TRACKER.md](./docs/DEVELOPMENT_TRACKER.md) for the current status and known gaps.
