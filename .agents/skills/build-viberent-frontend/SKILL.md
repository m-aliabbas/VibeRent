---
name: build-viberent-frontend
description: Build and extend VibeRent's responsive frontend prototype, including the app shell, dashboard, Vehicles, Bookings, Customers, Expenses, Reports, Owners, Settings, reusable data tables, forms, filters, status treatments, and realistic mock interactions. Use for any request to implement, redesign, or connect a VibeRent UI screen or shared frontend component.
---

# Build VibeRent Frontend

Build a coherent rental-operations product rather than isolated screenshots. Follow the repository `AGENTS.md` and read [references/product-brief.md](references/product-brief.md) before implementation.

## Workflow

1. Inspect the current app, dependency versions, established components, and the target route. Do not replace working conventions without a clear reason.
2. Translate the request into a user workflow: entry point, primary action, validation, success state, and recovery states.
3. Reuse the shell and shared primitives. If the needed pattern does not exist, build the smallest reusable version that supports the current screen.
4. Use typed, deterministic mock data. Keep it in a fixture or repository layer so a future API can replace it without rewriting the view.
5. Implement real prototype behavior: navigation, search, filters, pagination or view switching, form validation, dialogs, and feedback as appropriate.
6. Verify the route at desktop and mobile widths. Run lint, typecheck, and build commands that exist in the repository.

## Screen composition

Use a persistent app shell with sidebar navigation on wide screens and an accessible drawer or compact navigation on small screens. Keep page structure predictable:

1. Breadcrumb or context when needed.
2. `PageHeader` with title, short description, and a clear primary action.
3. Summary cards only when they aid decisions.
4. Search and filters near the content they control.
5. Main table, calendar, form, or report.
6. Empty, loading, error, and confirmation states.

For CRUD screens, use Vehicles as the reference module. Keep columns, form fields, validation, and domain rules local; share layout and interaction patterns.

## Visual system

- Use `#006FE6` as the primary action color, `#19191F` for main text, white surfaces, and `#F8FAFC` for the canvas.
- Use 12px card radii, quiet borders, subtle shadows, and a compact professional density.
- Prefer a neutral sans-serif with strong numeric legibility.
- Use status color only for meaning, and pair it with a readable label.
- Use Lucide icons consistently. Do not use emoji as product icons.
- Use realistic PKR amounts, Pakistani cities, names, plates, dates, and rental terminology.

## Responsive behavior

- Preserve the primary task at every width; do not merely shrink the desktop layout.
- Collapse the sidebar deliberately and keep the page action reachable.
- Convert dense tables to prioritized columns or labeled mobile cards.
- Stack forms in a logical reading order and keep inputs at least touch-friendly height.
- Prevent clipped menus, dialogs, calendars, and date pickers.

## Prototype boundary

Implement frontend behavior with mock services unless the user explicitly expands scope. Do not add a database, authentication provider, upload service, payment integration, or server API just to make a prototype look complete. Mark intentionally unavailable operations clearly in the UI.

## Definition of done

- The requested workflow is complete and navigable.
- Visible controls behave consistently and provide feedback.
- Shared components are used where the same pattern already exists.
- The screen works at mobile and desktop widths without accidental overflow.
- Basic accessibility is present: semantic controls, labels, focus states, keyboard operation, contrast, and reduced-motion respect.
- Available lint, typecheck, and build checks pass, or any pre-existing failures are reported precisely.

