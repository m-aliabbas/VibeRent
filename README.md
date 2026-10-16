# VibeRent

## Windows desktop pilot

VibeRent now includes a Tauri v2 desktop service launcher, Firebase-backed signed device licensing, SQLite-safe local and Google Drive backups, restart-only restore, and GitHub Actions workflows for quality checks and Windows NSIS releases. The desktop build launches the existing standalone Next.js modular monolith on port 80, prefers `http://rent.local` in the default browser, automatically falls back to `http://localhost` when the mDNS hostname is unavailable, and advertises `rent.local` over mDNS; there is no separate Python backend.

See [`WINDOWS_RELEASE.md`](./WINDOWS_RELEASE.md) for Firebase, Google OAuth, installer, runtime-data, backup/restore, and release setup.

## SQLite pilot database

The pilot uses SQLite in WAL mode through Drizzle ORM. It supports one deployed application instance with the database on durable local storage; do not place the database on a shared network filesystem or run multiple writers across app instances. In the desktop build, the database and private files live under the OS application-data directory and survive installer upgrades.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:check
npm run db:check:desktop-backup
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

VibeRent is a responsive car-rental operations system for Pakistani agencies managing owned and third-party vehicles. Core fleet, customer, booking, rental-operation, expense, audit, authentication, and desktop backup flows now persist through the local SQLite backend; remaining product gaps are tracked separately.

## Run locally

```bash
npm install
npm run dev
```

Open [http://rent.local](http://rent.local). The development launcher advertises
that hostname over mDNS/Bonjour and serves on port 80, so the URL does not need
a port suffix. On Unix systems, binding port 80 may require a one-time local
port-forwarding/capability setup; use `VIBERENT_LOCAL_PORT=3000 npm run dev` or
`npm run dev:standard` when that setup is unavailable. Windows normally allows
the launcher to bind directly unless port 80 is already reserved by IIS/HTTP.sys.

### Run on the local network

VibeRent's frontend, Server Actions, `/api/v1` backend, and SQLite access run in one Node.js application process. To expose that single instance on trusted devices across the local network:

```bash
npm run dev:lan
```

For a built release, run `npm run build` once and then `npm run start:lan`. Both LAN commands bind to `0.0.0.0:4321` and apply database migrations before startup. Configure `.env.local` with the URL clients will use:

```dotenv
BETTER_AUTH_URL=http://pos.local:4321
BETTER_AUTH_TRUSTED_ORIGINS=http://pos.local:4321,http://192.168.1.25:4321
```

Open `http://pos.local:4321` when the server computer advertises the `pos.local` hostname through mDNS/Bonjour. Otherwise use `http://<server-LAN-IP>:4321`. Allow TCP port 4321 only on the private network firewall. Run only one VibeRent application instance against the SQLite database; phones and other computers are clients of that same backend, not additional database writers.

## Quality commands

```bash
npm run lint
npm run typecheck
npm run build
```

## Product and development documentation

Start with [docs/README.md](./docs/README.md). It links the product scope, detailed features, user flows, domain rules, data model, roadmap, backlog, development tracker, QA checklist, decisions, and changelog.

## Current application

- Responsive application shell and dashboard.
- Persistent vehicle, customer, booking, rental-operation, expense, owner, and settings workflows.
- Tauri desktop packaging with signed device licensing and local/Google Drive recovery.
- Pakistani rental fixtures and PKR formatting.
- Some settings, reports, and integrations remain prototype-level or intentionally deferred.

See [docs/DEVELOPMENT_TRACKER.md](./docs/DEVELOPMENT_TRACKER.md) for the current status and known gaps.
