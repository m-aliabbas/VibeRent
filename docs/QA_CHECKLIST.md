# VibeRent QA Checklist

Use this checklist for feature review and milestone release gates. Mark only checks actually performed. A passed build does not substitute for interaction or responsive testing.

## 1. Universal screen checks

### Structure and content

- [ ] Route loads directly and through in-app navigation.
- [ ] Page title, description, and primary action are correct.
- [ ] Labels use rental-domain language consistently.
- [ ] Dates, times, PKR amounts, percentages, and plates use standard formatting.
- [ ] Fictional Pakistani data is plausible and contains no real sensitive identity data.
- [ ] Every enabled visible control performs an action.
- [ ] Unavailable controls are disabled or explained.

### Feedback states

- [ ] Initial loading state does not cause destructive layout shift.
- [ ] Empty state explains what is empty and offers a relevant action.
- [ ] Filtered-empty state explains how to recover.
- [ ] Recoverable error preserves user context and offers retry.
- [ ] Validation identifies the exact field and correction.
- [ ] Successful mutations show durable UI change and appropriate feedback.
- [ ] Duplicate submission is prevented.
- [ ] Destructive action requires confirmation and states impact.

### Accessibility

- [ ] Heading order is logical and one primary `h1` exists.
- [ ] Inputs retain visible labels; placeholder is not the only label.
- [ ] Buttons/links have accessible names that describe the action.
- [ ] Keyboard-only navigation reaches all interactive elements.
- [ ] Focus indicator is clearly visible.
- [ ] Dialog opens with focus inside, traps focus, closes with Escape, and restores focus.
- [ ] Menu/select behavior works with keyboard.
- [ ] Status meaning is conveyed by text, not only color.
- [ ] Text and control contrast meet WCAG AA targets.
- [ ] Touch targets are approximately 44px where practical.
- [ ] Reduced-motion preference is respected.
- [ ] Toast/status feedback is exposed to assistive technology.

### Responsive behavior

- [ ] 390×844 primary mobile workflow is usable.
- [ ] Tablet/intermediate width does not create awkward clipping.
- [ ] 1440px desktop uses space efficiently.
- [ ] No accidental horizontal page overflow.
- [ ] Sidebar becomes an accessible mobile drawer.
- [ ] Primary action remains reachable on mobile.
- [ ] Dense table becomes prioritized columns or cards, not unusable sideways scrolling.
- [ ] Dialog/form fits viewport and supports internal scrolling where needed.
- [ ] Dropdowns/action menus remain within viewport.

### Technical checks

- [ ] Browser console contains no new error/warning caused by the feature.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Network or mock repository failures do not expose stack traces/secrets.
- [ ] No unnecessary dependency was added.

## 2. Application shell and dashboard

- [ ] Active navigation matches current route.
- [ ] Mobile drawer opens/closes via button, overlay, Escape, and route selection.
- [ ] Global search result behavior is complete or clearly not enabled.
- [ ] Dashboard metrics share the same date/time context.
- [ ] Today’s schedule is correctly ordered.
- [ ] Pickup/return type, time, vehicle, customer, and location remain scannable.
- [ ] Dashboard action links preserve intended context.
- [ ] Partial panel errors do not replace valid metrics with false zeroes.

## 3. Vehicles

### List

- [ ] Search matches normalized plate, make, and model.
- [ ] Status, city, ownership, and category filters combine correctly.
- [ ] Clear Filters restores the full result.
- [ ] Sorting toggles direction and uses correct numeric/text comparison.
- [ ] Pagination resets when filters change and never points past available pages.
- [ ] Mobile cards expose core data and row actions.

### Create/edit

- [ ] Required fields validate.
- [ ] Plate normalization and duplicate detection work.
- [ ] Year and rate boundaries work.
- [ ] Managed selection requires owner/agreement context.
- [ ] Changing ownership safely handles owner-specific data.
- [ ] Save updates list/detail and keeps stable record identity.
- [ ] Cancel/close does not apply changes.
- [ ] Unsaved-change warning works when implemented.

### Status/detail/archive

- [ ] Detail data matches selected list record.
- [ ] Only valid next statuses are offered.
- [ ] Blocking booking/maintenance conflict is explained.
- [ ] Checked Out state cannot be bypassed manually.
- [ ] Archive is blocked for active/future booking and requires confirmation.
- [ ] Historical references remain after archive.

## 4. Availability and booking

- [ ] End date/time earlier than or equal to start is rejected.
- [ ] Same vehicle cannot be confirmed for overlapping blocking intervals.
- [ ] Adjacent intervals follow turnaround-buffer policy.
- [ ] Maintenance, manual block, out-of-service, archive, and transfer restrictions apply.
- [ ] Location/branch feasibility applies.
- [ ] Availability is rechecked immediately before confirmation.
- [ ] Conflict recovery preserves schedule, customer, pricing inputs, and extras.
- [ ] Blacklisted/restricted customer policy applies.
- [ ] Rate and policy snapshot appear in review.
- [ ] Total equals visible line items.
- [ ] Confirmation creates booking number and updates availability.
- [ ] Cancellation releases availability and records financial follow-up.
- [ ] Amendment preserves history and shows price difference.

## 5. Checkout and check-in

- [ ] Only Confirmed booking can start checkout.
- [ ] Identity/license/deposit requirements apply.
- [ ] Checkout odometer cannot precede trusted prior odometer.
- [ ] Required checklist/photos cannot be skipped without permitted override.
- [ ] Completing checkout synchronizes booking and vehicle state.
- [ ] Extension checks later conflicts.
- [ ] Check-in odometer cannot be below checkout.
- [ ] Actual return time calculates lateness using policy.
- [ ] Fuel/distance/damage charges show source and formula.
- [ ] Waiver requires reason/approval where configured.
- [ ] Deposit application/refund and outstanding balance reconcile.
- [ ] Post-return vehicle state correctly updates availability.

## 6. Customers

- [ ] Phone/CNIC/license searches use normalized values.
- [ ] Exact duplicate identity blocks accidental creation.
- [ ] Probable duplicate warning offers existing record.
- [ ] Sensitive identity values are masked for unauthorized contexts.
- [ ] License/document expiry affects eligibility according to policy.
- [ ] Warning versus blocking restriction behaves correctly.
- [ ] Restriction close preserves history.

## 7. Payments and expenses

- [ ] Payment amount must be positive.
- [ ] Duplicate submission cannot create duplicate transaction.
- [ ] Overpayment follows configured policy.
- [ ] Posted payment correction creates a reversal.
- [ ] Deposit balance never goes below zero.
- [ ] Refund does not exceed refundable amount.
- [ ] Booking balance reconciles after payment/refund/adjustment.
- [ ] Vehicle-linked expense appears once in P&L.
- [ ] Managed vehicle responsibility defaults from applicable agreement.
- [ ] Approval/rejection/reversal history is preserved.

## 8. Owner statements

- [ ] Correct agreement version is applied.
- [ ] Statement period includes only eligible source records.
- [ ] Revenue share basis and math are visible.
- [ ] Owner-chargeable expenses are included once.
- [ ] Drill-down source sum equals aggregate.
- [ ] Approved statement source lines are locked.
- [ ] Partial payout updates remaining payable balance.
- [ ] Overpayment is blocked unless authorized advance exists.
- [ ] Correction uses void/adjustment, not silent mutation.

## 9. Reports

- [ ] Filters use consistent period boundaries and agency time zone.
- [ ] Booked revenue and collected cash are not mislabeled.
- [ ] Utilization definition states treatment of downtime.
- [ ] Aggregate reconciles to drill-down.
- [ ] Empty filters and no-data states are distinct.
- [ ] Export respects filters, permission, masking, and locale.

## 10. Pilot security/reliability gate

- [ ] Agency/tenant isolation is enforced server-side and tested.
- [ ] Role and branch authorization are tested for read and mutation paths.
- [ ] Sensitive files are private and use expiring access.
- [ ] Audit events cover critical operational/financial changes.
- [ ] Logs do not include passwords, tokens, full identity values, or private file URLs.
- [ ] Booking confirmation handles concurrency atomically.
- [ ] Database and file backups are automated.
- [ ] Restore procedure has been executed successfully.
- [ ] Monitoring and alert ownership are configured.
- [ ] Retention/deletion policy is documented.
- [ ] Production incident and support runbook exists.

## 11. QA run record template

```md
### QA Run: <feature/ticket>

- Date:
- Tester:
- Build/commit:
- Routes:
- Viewports/devices:
- Primary flow:
- Recovery/empty flow:
- Commands run:
- Console result:
- Findings:
- Result: Pass / Pass with known gaps / Fail
```

