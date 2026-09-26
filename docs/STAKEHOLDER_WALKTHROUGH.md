# VibeRent Stakeholder Walkthrough

Use these scenarios for the frontend-prototype sign-off. Record feedback in the table at the end instead of silently expanding the prototype boundary.

## W-01 — Create and check out a booking

**Persona:** Rental Agent  
**Route:** Dashboard → New Booking → Booking detail → Checkout

1. Select Lahore, dates, an available vehicle, and an existing eligible customer.
2. Review pricing and confirm the booking.
3. Record a payment/deposit, complete the handover checklist and simulated photos, then review checkout.
4. Confirm that conflict recovery retains prior inputs and checkout requirements cannot be skipped.

## W-02 — Return a damaged vehicle

**Persona:** Fleet Manager  
**Route:** Bookings → Checked Out booking → Check In

1. Record return odometer, fuel, condition, accessories, and simulated photos.
2. Review distance, fuel, damage, toll, and late charges.
3. Apply the held deposit and choose Cleaning/Maintenance disposition.
4. Confirm that invalid odometer and unresolved balance behavior are clearly explained.

## W-03 — Approve costs and reconcile an owner

**Persona:** Accountant  
**Route:** Expenses → Owners → Owner detail

1. Create and submit an owner-allocated expense.
2. Approve it, open Farhan Qureshi, and review the September statement sources.
3. Review, approve, reconcile, and record a partial payout.
4. Confirm that overpayment is blocked and corrections use adjustments/voids.

## W-04 — Review monthly performance

**Persona:** Agency Owner  
**Route:** Reports

1. Filter September by city and review Vehicle P&L.
2. Drill into a figure and compare its source lines.
3. Review collections, utilization, expenses, and owner exposure.
4. Export CSV and confirm the production export boundary is explicit.

## W-05 — Mobile field workflow

**Persona:** Field Agent  
**Viewport:** 390×844

1. Navigate through the mobile drawer to a booking.
2. Complete checkout and return dialogs with the on-screen keyboard considered.
3. Confirm primary actions remain reachable, dialogs scroll internally, and status text is legible.

## Feedback log

| ID | Scenario | Priority | Feedback | Status | Decision |
| --- | --- | --- | --- | --- | --- |
| FB-01 | W-02 | Medium | Confirm “Cleaning / Maintenance” terminology with operations. | Open | Review before pilot |
| FB-02 | W-04 | Low | XLSX export requested for accounting. | Deferred | Requires pilot export authorization |

## Sign-off boundary

This walkthrough signs off the deterministic frontend prototype only. Authentication, authorization, tenant isolation, durable persistence, private file storage, transactional booking confirmation, audit logs, backups, and monitoring remain pilot-backend work.
