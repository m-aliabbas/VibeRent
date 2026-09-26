# VibeRent repository guide

## Product

VibeRent is a responsive car-rental operations dashboard for local agencies. It manages owned and owner-managed vehicles, bookings, customers, expenses, reports, and owner payouts. The current milestone is a convincing frontend prototype backed by realistic local mock data.

Read these source notes before changing product behavior or visual direction:

- `Design2.md` for the agreed layout and design language.
- `UI.md` for screen-specific requirements.
- `Phases.md` for the larger product roadmap and domain scope.
- `ArchFocus.md` for the reuse-first component architecture.
- `Design.md` only for early naming and branding context; later documents take precedence.

If the notes conflict, use this priority: the user's latest request, `AGENTS.md`, `ArchFocus.md`, `Design2.md`, `UI.md`, `Phases.md`, then `Design.md`.

## Current scope

- Focus on frontend prototype work until the user explicitly asks for backend, database, or production authentication.
- Use deterministic mock data and client-side interactions for prototypes.
- Prefer one polished, navigable product experience over disconnected demo pages.
- Treat desktop and mobile as first-class. Agent workflows must remain practical on a phone.
- Do not invent integrations, API contracts, or persistence layers prematurely.

## Default frontend stack

When bootstrapping the app, use Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui unless the user specifies otherwise. Use Lucide icons and a chart library only where data visualization adds real value. Keep business data and UI state typed.

The product notes disagree about Prisma versus Drizzle. Do not choose either during frontend-only work. Ask or document a decision when persistence enters scope.

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
- Use `$review-viberent-ui` for UI review, responsive QA, accessibility checks, and consistency audits.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.
This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
