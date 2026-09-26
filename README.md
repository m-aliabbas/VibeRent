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
