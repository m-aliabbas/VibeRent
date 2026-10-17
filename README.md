# VibeRent

## Windows desktop pilot

VibeRent now includes a Tauri v2 desktop service launcher, Firebase-backed signed device licensing, SQLite-safe local and Google Drive backups, restart-only restore, and GitHub Actions workflows for quality checks and Windows NSIS releases. The desktop build launches the existing standalone Next.js modular monolith on port 80, prefers `http://rent.local` in the default browser, automatically falls back to `http://localhost` when the mDNS hostname is unavailable, and advertises `rent.local` over mDNS; there is no separate Python backend.

See [`WINDOWS_RELEASE.md`](./WINDOWS_RELEASE.md) for Firebase, Google OAuth, installer, runtime-data, backup/restore, and release setup.

## Database targets

Hosted web builds use PostgreSQL. The Windows desktop build remains SQLite in WAL mode and keeps the current self-contained installation and backup behavior. Both targets use the same application services and API routes through a shared async database adapter.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:check
npm run db:check:postgres
npm run db:check:agency-backup
npm run db:check:desktop-backup
```

For hosted web, set `VIBERENT_DATABASE=postgres` and `POSTGRES_URL`, then run `npm run db:migrate:web` and `npm run build:web`. For Windows, run `npm run build:desktop-server`; SQLite uses `SQLITE_DATABASE_PATH` or defaults to `.data/viberent.db` outside the packaged app.

The backend is a Next.js modular monolith: Server Actions and `/api/v1` Route Handlers call the same application services and enforce tenant scope. Vehicle changes and booking confirmations append audit events. Booking confirmation uses a database transaction and half-open intervals (`[pickupAt, returnAt)`). `GET|POST /api/v1/agency-backup` exports and restores one agency as a validated SQLite package; this is separate from PostgreSQL platform backups.

### Docker Compose web deployment

The Compose stack runs the hosted web target with PostgreSQL 17, persistent database storage, persistent private-file storage, health checks, and automatic migrations before the application starts.

See [`LINUX_SERVER_DEPLOYMENT.md`](./LINUX_SERVER_DEPLOYMENT.md) for complete Linux server setup, HTTPS, upgrades, persistence, backup, and disaster-recovery instructions.

```bash
cp .env.docker.example .env.docker
# Replace every CHANGE_ME value, then:
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

Open `http://localhost:3000`, or the port configured by `APP_PORT`. For production, set `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` to the public HTTPS URL and place the service behind a TLS reverse proxy. The PostgreSQL password must remain synchronized between `POSTGRES_PASSWORD` and `POSTGRES_URL`. Do not commit `.env.docker`.

To view logs or stop the services without deleting their persistent volumes:

```bash
docker compose --env-file .env.docker logs -f web
docker compose --env-file .env.docker down
```

## Authentication and organizations

VibeRent uses Better Auth with the selected Drizzle database for verified email/password accounts, secure cookie sessions, password recovery, organizations, invitations, and custom staff roles. Copy `.env.example`, set a strong `BETTER_AUTH_SECRET`, and set the deployed `BETTER_AUTH_URL`.

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

VibeRent is a responsive car-rental operations system for Pakistani agencies managing owned and third-party vehicles. Core workflows persist through PostgreSQL on hosted web and SQLite on Windows desktop; remaining product gaps are tracked separately.

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

For a built local SQLite release, run `npm run build:desktop-server` once and then `npm run start:lan`. Both LAN commands bind to `0.0.0.0:4321` and apply SQLite migrations before startup. Configure `.env.local` with the URL clients will use:

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
