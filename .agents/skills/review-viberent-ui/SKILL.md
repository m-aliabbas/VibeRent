---
name: review-viberent-ui
description: Review and verify VibeRent frontend work for visual consistency, responsive behavior, accessibility, interaction completeness, rental-domain correctness, and adherence to the shared component architecture. Use when asked to audit, critique, test, polish, or perform QA on a VibeRent screen or frontend implementation.
---

# Review VibeRent UI

Audit the working product, not only source code. Follow the repository `AGENTS.md`. Report evidence in priority order and distinguish actual defects from optional polish.

## Review sequence

1. Inspect the changed code and identify the intended workflow.
2. Run the app using its documented command. Do not alter product code merely to make the review easier.
3. Exercise the primary path and one recovery or empty path.
4. Inspect representative desktop and mobile widths.
5. Check the browser console and the available lint, typecheck, and build commands.
6. Report findings with file/line references when the cause is in code, plus concise reproduction steps.

## Review criteria

### Product correctness

- Labels and statuses match the rental domain.
- PKR, dates, percentages, and vehicle/customer data are formatted consistently.
- Filters affect the visible result and can be cleared.
- Destructive actions require confirmation.
- Visible actions work or are clearly presented as unavailable.

### Layout and visual consistency

- Shell, page header, spacing, radius, typography, and icon style match existing screens.
- Primary blue is reserved for emphasis and actions.
- Dense operational information remains scannable.
- Loading, empty, error, and filtered-empty states do not cause layout jumps.

### Responsive behavior

- No accidental horizontal page overflow.
- Navigation, primary action, tables, filters, forms, dialogs, calendars, and menus remain usable at narrow widths.
- Mobile layouts prioritize the task instead of preserving every desktop column.
- Tap targets are comfortably sized.

### Accessibility

- Controls have accessible names and correct semantics.
- Forms have persistent labels, validation messages, and sensible focus movement.
- Keyboard focus is visible; dialogs trap and restore focus.
- Color is not the only status signal and contrast is sufficient.
- Animation respects reduced-motion preferences.

### Architecture

- Existing shared components are reused appropriately.
- Feature-specific business rules do not leak into generic UI primitives.
- Components are neither duplicated nor made excessively configurable for hypothetical cases.
- Mock data is typed and separated from presentation code.

## Output format

Lead with actionable findings ordered by severity. For each finding, state the impact, evidence, and smallest credible fix. Then list checks performed and unresolved test gaps. If no defects are found, say so explicitly and mention remaining coverage limits.

