# VibeRent Domain Rules

## 1. General rules

- **BR-GEN-01:** Every operational record belongs to exactly one agency.
- **BR-GEN-02:** Branch-scoped users access only allowed branches unless their role grants agency-wide access.
- **BR-GEN-03:** Dates are stored as instants with agency time-zone context; UI defaults to Asia/Karachi.
- **BR-GEN-04:** Money is stored as integer minor units. Display defaults to whole PKR where appropriate.
- **BR-GEN-05:** Posted financial records are reversed or adjusted, never silently overwritten or deleted.
- **BR-GEN-06:** Archive is preferred to hard delete for business records referenced by history.
- **BR-GEN-07:** Important mutations capture actor, timestamp, reason where applicable, and before/after context.

## 2. Vehicle state

Operational vehicle states:

- `Draft`: incomplete setup; never bookable.
- `Available`: eligible for availability evaluation.
- `Booked`: at least one imminent/current confirmed booking; not proof of a time conflict by itself.
- `Checked Out`: physically with a customer on an active rental.
- `Maintenance`: unavailable due to service/repair.
- `Out of Service`: unavailable for an indefinite safety/legal/operational reason.
- `Archived`: retired from active fleet; historical references remain.

Rules:

- **BR-VEH-01:** Display status and calculated availability are separate concepts.
- **BR-VEH-02:** A vehicle is available for an interval only if it is eligible, in the correct location, and has no blocking interval overlap.
- **BR-VEH-03:** Plate is normalized and unique per agency, excluding a deliberate restored/legacy migration exception.
- **BR-VEH-04:** Checked Out state is controlled by the booking checkout/check-in process.
- **BR-VEH-05:** Archiving requires no active rental and no unresolved future booking.
- **BR-VEH-06:** Managed vehicle booking dates must fall within an active management agreement.
- **BR-VEH-07:** A document required by policy must remain valid through the booking end or require an authorized override.

## 3. Booking state machine

States:

- `Draft`: incomplete; does not block inventory unless a separate expiring hold exists.
- `Pending`: awaiting approval, customer document, or deposit according to policy.
- `Confirmed`: valid reservation that blocks availability.
- `Checked Out`: vehicle handed to customer.
- `Completed`: vehicle returned and operational check-in completed.
- `Cancelled`: terminated before checkout.
- `No Show`: customer did not arrive; treated separately for reporting/fees.

Allowed primary transitions:

```text
Draft -> Pending | Confirmed | Cancelled
Pending -> Confirmed | Cancelled
Confirmed -> Checked Out | Cancelled | No Show
Checked Out -> Completed
```

Rules:

- **BR-BKG-01:** Pickup time must be earlier than return time.
- **BR-BKG-02:** Confirmed and Checked Out bookings block the vehicle interval.
- **BR-BKG-03:** Confirmation performs an atomic final availability check.
- **BR-BKG-04:** Completed, Cancelled, and No Show are terminal; correction uses an explicit reopen/adjustment permission if later supported.
- **BR-BKG-05:** Reassignment/date changes recheck availability before releasing the original allocation.
- **BR-BKG-06:** Price policy, rate, discount, and commercial terms are snapshotted at confirmation.
- **BR-BKG-07:** A checked-out booking cannot be cancelled; use return/termination handling.
- **BR-BKG-08:** Actual pickup/return times are recorded separately from scheduled times.

## 4. Interval and availability rules

- **BR-AVL-01:** Intervals use half-open comparison: `[start, end)`. A booking ending at 10:00 does not conflict with one starting at 10:00, subject to turnaround policy.
- **BR-AVL-02:** Conflict exists when `candidateStart < existingEnd` and `candidateEnd > existingStart`.
- **BR-AVL-03:** Agency-configured preparation/cleaning buffer expands the blocked interval.
- **BR-AVL-04:** Blocking sources are confirmed/checked-out bookings, manual blocks, blocking maintenance, and transfers.
- **BR-AVL-05:** Draft bookings do not block availability unless a timed hold is created.
- **BR-AVL-06:** Location feasibility considers latest known location, transfer time, and branch pickup rules.
- **BR-AVL-07:** Availability results are provisional until booking confirmation succeeds.

## 5. Pricing rules

Definitions:

- Base rental: rate snapshot multiplied by chargeable duration.
- Extras: sum of per-booking, per-day, and quantity charges.
- Adjustments: approved discount or surcharge.
- Estimated total: base rental + extras + fees/tax + surcharges − discount.
- Final total: estimated total + check-in charges − waived amounts.
- Outstanding balance: final/estimated total + applied deposit deductions − payments − credits/refunds as applicable.

Rules:

- **BR-PRC-01:** Store all line items; do not store only a total.
- **BR-PRC-02:** Rate selection precedence must be deterministic: explicit vehicle/city override, category/city rate, then agency default.
- **BR-PRC-03:** Confirmed booking uses a snapshot; future rate edits do not retroactively change it.
- **BR-PRC-04:** Discount records type, value, reason, and approver when above role threshold.
- **BR-PRC-05:** Duration rounding policy is agency-configured and shown before confirmation.
- **BR-PRC-06:** Check-in charges identify calculation source and allow reasoned authorized override.

## 6. Payment and deposit rules

- **BR-PAY-01:** Payment amount must be positive; correction uses reversal.
- **BR-PAY-02:** Overpayment is rejected unless policy explicitly creates customer credit.
- **BR-PAY-03:** Deposit is a liability/held amount until refunded, released, forfeited, or applied.
- **BR-PAY-04:** Deposit deduction cannot exceed held balance.
- **BR-PAY-05:** Refund cannot exceed refundable unapplied receipts.
- **BR-PAY-06:** Every transaction includes method, date/time, actor, and booking/customer context.
- **BR-PAY-07:** Cash drawer/account reconciliation is future scope but payment account is modeled now.

## 7. Check-out and check-in rules

- **BR-OUT-01:** Checkout requires Confirmed status and the assigned vehicle unless reassignment completes.
- **BR-OUT-02:** Required identity, license, deposit/payment, odometer, fuel, and checklist rules are policy-driven.
- **BR-OUT-03:** Checkout odometer cannot be below the last trusted vehicle odometer.
- **BR-IN-01:** Check-in odometer cannot be below checkout odometer.
- **BR-IN-02:** Extra distance equals positive difference between actual distance and included allowance.
- **BR-IN-03:** Late charge is calculated from actual return versus scheduled return using grace/rounding policy.
- **BR-IN-04:** Damage charge links evidence and optionally a maintenance case.
- **BR-IN-05:** Operational completion is allowed with outstanding balance if policy/permission permits; balance remains open.

## 8. Customer rules

- **BR-CUS-01:** Phone and identity values are normalized before duplicate comparison.
- **BR-CUS-02:** Exact identity match blocks duplicate creation; probable phone/name match warns and offers existing records.
- **BR-CUS-03:** Blocked restriction prevents confirmation unless a specifically authorized override is recorded.
- **BR-CUS-04:** Warning restriction informs the agent but does not automatically block.
- **BR-CUS-05:** Sensitive identifiers are masked according to role and screen purpose.
- **BR-CUS-06:** Customer deletion becomes archive when any booking or transaction exists.

## 9. Expense rules

- **BR-EXP-01:** Approved expense contributes to reports; Draft/Rejected does not.
- **BR-EXP-02:** Direct vehicle cost requires a vehicle link.
- **BR-EXP-03:** Booking-specific expense may also link to its vehicle for reporting but is not double-counted.
- **BR-EXP-04:** Managed-vehicle expense responsibility defaults from the applicable agreement.
- **BR-EXP-05:** Approved expense correction uses reversal/adjustment.

## 10. Owner statement rules

- **BR-OWN-01:** Use agreement version effective for the underlying booking/expense date according to documented policy.
- **BR-OWN-02:** Only eligible completed rental revenue enters a statement unless agreement explicitly uses collected revenue.
- **BR-OWN-03:** Owner share and agency share calculation basis must be visible.
- **BR-OWN-04:** A source line cannot belong to multiple active statements.
- **BR-OWN-05:** Approved statements lock their source allocation; correction uses void/adjustment.
- **BR-OWN-06:** Payout cannot exceed payable balance without an authorized advance entry.

## 11. Reporting formulas

- **BR-RPT-01:** Utilization = occupied eligible time ÷ available eligible time × 100.
- **BR-RPT-02:** Maintenance/out-of-service time is reported separately and excluded or included according to named report definition—never silently.
- **BR-RPT-03:** Booked revenue and collected cash are separate measures.
- **BR-RPT-04:** Vehicle contribution = eligible rental revenue − direct vehicle expenses − owner share − explicitly allocated charges.
- **BR-RPT-05:** Report drill-down sum must reconcile to displayed aggregate after identical filters and rounding.

## 12. Permissions baseline

| Capability | Agency Owner | Fleet Manager | Rental Agent | Accountant |
| --- | --- | --- | --- | --- |
| View fleet/bookings/customers | Yes | Yes | Yes | Yes |
| Create/edit vehicles | Yes | Yes | Limited | No |
| Change maintenance/status | Yes | Yes | Limited | No |
| Create/amend bookings | Yes | Yes | Yes | View |
| Checkout/check-in | Yes | Yes | Yes | No |
| Apply large discount/override | Yes | Configurable | No | No |
| Record payment | Yes | Configurable | Yes | Yes |
| Reverse payment/write off | Yes | No | No | Yes |
| Record expense | Yes | Yes | Limited | Yes |
| Approve expense | Yes | Configurable | No | Yes |
| Approve owner statement/payout | Yes | No | No | Configurable |
| Manage users/settings | Yes | Limited | No | No |

Server enforcement is mandatory for pilot; this table is a starting policy and may be refined.

