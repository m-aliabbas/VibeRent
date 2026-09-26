# VibeRent User Flows

Each flow defines the entry point, main path, validation, completion state, and recovery paths. Status transitions referenced here are defined in [DOMAIN_RULES.md](./DOMAIN_RULES.md).

## FL-DSH-01 — Start the operational day

**Actor:** Rental Agent or Fleet Manager  
**Entry:** Dashboard after sign-in  
**Goal:** Identify the next pickup/return and any blocking issue.

Main flow:

1. System loads agency-local date/time and today’s operational metrics.
2. User reviews pickups and returns ordered by scheduled time.
3. Warnings identify unpaid deposit, missing document, overdue return, or vehicle exception.
4. User opens the relevant booking.
5. Booking detail presents the next valid action: prepare, collect payment, check out, or check in.

Recovery and edge cases:

- When dashboard data partially fails, successful panels remain usable and the failed panel offers retry.
- When there are no movements, show the next scheduled movement and a create-booking action.
- When the user lacks financial permission, monetary values are hidden or summarized according to role.

Completion: User reaches the correct operational workflow with booking context intact.

## FL-VEH-01 — Add an agency-owned vehicle

**Actor:** Fleet Manager  
**Entry:** Vehicles → Add Vehicle  
**Goal:** Make a vehicle available for rental.

1. Enter plate, make, model, year, color, category, transmission, and fuel type.
2. Select `Own`, city/branch, initial status, and base daily rate.
3. Optionally add photo, registration, insurance, fitness, and notes.
4. System validates required values, plate uniqueness, valid year/rate, and document dates.
5. User reviews and saves.
6. System creates vehicle, records initial status/location, and shows success with a link to detail.

Alternate paths:

- Save as incomplete draft if required documents are missing; draft vehicle cannot be booked.
- If plate already exists, show the matching record and offer to open it.
- If initial status is Maintenance or Out of Service, require a reason.

Completion: Vehicle appears in fleet and availability according to its status and data completeness.

## FL-VEH-02 — Add a managed vehicle

1. Follow `FL-VEH-01` vehicle details.
2. Select `Managed` ownership.
3. Search for an owner or create one without losing vehicle form state.
4. Add agreement terms: effective dates, revenue-share method, owner percentage/fixed amount, expense responsibility, and payout frequency.
5. Validate that agreement dates cover any planned availability date.
6. Save vehicle and versioned agreement together.

Recovery:

- If an owner is inactive, prevent selection and explain how to reactivate.
- If percentage allocation exceeds 100%, block save.
- If agreement is incomplete, save vehicle as non-bookable draft.

## FL-VEH-03 — Change vehicle operational status

1. Open vehicle detail and select Change Status.
2. System lists only valid next states.
3. User chooses status, effective time, reason, and notes.
4. System checks active booking, checkout, maintenance, and future conflicts.
5. User resolves blocking conflicts or cancels.
6. System records transition and refreshes availability.

Examples:

- Available → Maintenance: warn about overlapping bookings and require resolution.
- Maintenance → Available: require service completion or authorized override.
- Checked Out → Available: disallowed; booking must complete check-in first.
- Any active state → Archived: disallowed while future/active bookings exist.

## FL-VEH-04 — Transfer a vehicle between branches

1. Open vehicle and select Transfer.
2. Choose origin, destination, departure/expected arrival, assigned agent/driver, and notes.
3. System checks bookings around transfer window and destination feasibility.
4. Confirm transfer; vehicle is unavailable during the transfer window.
5. Departure marks transfer In Transit.
6. Arrival records destination and returns vehicle to the appropriate operational status.

Exception: Delayed arrival recalculates conflicts and alerts assigned agents.

## FL-AVL-01 — Find an available vehicle

1. Enter pickup city/branch, start date/time, and end date/time.
2. Optionally filter category, transmission, rate range, or features.
3. System validates the interval and searches booking, maintenance, manual block, transfer, and status constraints.
4. Results display total estimated base price and key policy information.
5. User selects a vehicle to begin booking.

Unavailable vehicle explanation may include:

- Confirmed/checked-out booking overlap.
- Maintenance or manual block.
- Out of Service/Archived status.
- Wrong city with insufficient transfer time.
- Required document expires before booking end.

## FL-BKG-01 — Create and confirm a booking

**Actor:** Rental Agent  
**Entry:** New Booking, empty calendar period, customer profile, or vehicle detail.

1. **Schedule:** Select branch/city, pickup date/time, return date/time, and pickup/return location.
2. **Vehicle:** Search availability and choose one vehicle.
3. **Customer:** Search existing customers; review warnings and document validity; create a customer if no match exists.
4. **Pricing:** Review rate snapshot, duration, extras, delivery, discount, deposit, taxes/fees if configured, total, paid, and due.
5. **Review:** Confirm vehicle, customer, schedule, price, policy, source, and assigned agent.
6. System performs a final availability and customer eligibility check.
7. User confirms booking.
8. System creates booking number, blocks availability, records price snapshot, and shows next actions.

Validation:

- End must be later than start and satisfy minimum duration.
- Customer cannot be blocked/blacklisted unless authorized override exists.
- License/document must remain valid according to agency policy.
- Discount beyond agent threshold requires approval.
- Required deposit may be due before confirmation or checkout according to policy.

Conflict recovery:

- If availability changed during the wizard, keep all entered data and return to vehicle selection with alternatives.
- If customer duplicate is detected, offer to merge/select existing instead of creating another record.
- Draft booking does not block availability until policy-defined hold is created.

## FL-BKG-02 — Amend a booking

1. Open booking and select Amend.
2. Edit allowed fields based on status.
3. System recalculates availability and pricing difference.
4. Display before/after schedule, vehicle, and amount.
5. Require reason for material change.
6. Confirm amendment and create audit entry.
7. Record extra payment/refund due rather than altering payment history.

Restrictions:

- Completed or cancelled bookings cannot be directly amended.
- Checked-out bookings use extension/return adjustment flows.
- Vehicle/date change requires a new availability lock and atomic swap.

## FL-BKG-03 — Cancel a booking

1. Select Cancel from booking detail.
2. Choose customer, agency, vehicle, duplicate, no-show, or other reason.
3. System calculates cancellation charge and refundable amount using the stored policy snapshot.
4. User reviews availability release and payment outcome.
5. Authorized user confirms.
6. Booking becomes Cancelled/No Show, availability releases, and refund/credit tasks are created.

Recovery: If refund cannot be processed, cancellation still completes but financial follow-up remains visible.

## FL-BKG-04 — Check out a rental

**Preconditions:** Confirmed booking, correct vehicle, customer eligible, required deposit/payment satisfied or authorized override.

1. Verify customer identity and driving license.
2. Confirm booking schedule, vehicle, emergency contact, and agreement terms.
3. Record actual checkout time and agent.
4. Record odometer and fuel level.
5. Complete condition checklist and capture vehicle photos.
6. Confirm accessories/documents handed over.
7. Record final pre-handover payment if needed.
8. Capture agreement acceptance/signature when enabled.
9. Review handover summary and complete.
10. Booking becomes Checked Out; vehicle becomes Checked Out.

Recovery:

- Vehicle mismatch requires an audited reassignment and availability check.
- Failed document/payment check allows authorized override with reason, otherwise blocks completion.
- Incomplete photo upload can save draft but does not complete checkout when photos are mandatory.

## FL-BKG-05 — Extend an active rental

1. Open checked-out booking and select Extend.
2. Enter proposed return date/time.
3. System checks the same vehicle against later bookings, maintenance, and transfer.
4. If available, calculate added rental charge and deposit impact.
5. Collect or record additional payment if required.
6. Confirm extension and notify affected operational schedule.

Conflict path: Offer a partial extension, replacement vehicle workflow, or decline with the blocking event shown.

## FL-BKG-06 — Check in a returned vehicle

1. Open checked-out booking and start Check In.
2. Record actual return time, odometer, and fuel.
3. Complete condition/accessory checklist and return photos.
4. Compare checkout and check-in values.
5. System proposes late, distance, fuel, damage, toll, and other charges.
6. Agent confirms, edits with reason, or requests approval for waived charges.
7. Review final invoice, payments, deposit application/refund, and outstanding balance.
8. Select post-return vehicle status: Available, Cleaning/Maintenance, or Out of Service.
9. Complete return.

Completion:

- Booking becomes Completed when operational return is finalized.
- Vehicle status follows post-return selection.
- Outstanding financial balance remains collectible and visible.
- Damage can create a linked maintenance case and expense estimate.

## FL-CUS-01 — Create a customer during booking

1. From customer step, search name, phone, or CNIC/passport.
2. If no suitable record exists, open inline Create Customer.
3. Enter identity, contact, address, license, and emergency contact.
4. System normalizes values and checks duplicates.
5. Save and return to booking with the new customer selected.

Do not clear booking schedule, vehicle, pricing, or extras if customer validation fails.

## FL-CUS-02 — Blacklist a customer

1. Open customer profile and select Add Restriction.
2. Select severity: Warning or Blocked.
3. Record reason, evidence/notes, effective date, and optional review date.
4. Confirm with permission check.
5. Future booking selection displays the restriction and follows policy.

Removing a restriction creates a closing event; it never deletes the original event.

## FL-PAY-01 — Record booking payment

1. Open booking and select Record Payment.
2. Enter amount, method, received time, reference/account, and note.
3. System validates positive amount, overpayment policy, and permissions.
4. Review allocation between rental amount and deposit if applicable.
5. Confirm; system creates immutable transaction and updates balance.
6. Offer receipt view/download and communication action when enabled.

## FL-PAY-02 — Refund or apply deposit

1. Open deposit record after cancellation or return.
2. Review original receipt, deductions, and refundable balance.
3. Choose full refund, partial refund, apply to charges, or forfeit with reason.
4. Select method/reference and approver if required.
5. Confirm; create linked transaction and update deposit state.

## FL-EXP-01 — Record a vehicle expense

1. Open Expenses → Add Expense or start from vehicle/booking.
2. Enter date, amount, category, description, vendor, and payment method.
3. Link vehicle and optionally booking.
4. For managed vehicles, select responsibility derived from agreement; override requires permission/reason.
5. Add receipt and note.
6. Save draft or submit/approve according to policy.
7. Approved expense appears in vehicle P&L and relevant owner statement period.

## FL-OWN-01 — Generate and pay an owner statement

1. Choose owner and statement period.
2. System gathers eligible completed rental revenue, applicable agreement terms, owner-chargeable expenses, prior balance, adjustments, and payouts.
3. Reviewer drills into every source line and resolves exceptions.
4. Approve statement; underlying lines are locked to that statement unless reversed.
5. Record full or partial payout with method, reference, date, and proof.
6. Statement becomes Paid only when payable balance is zero.

Correction path: Void or create adjustment/reversal; never silently change an approved/paid statement.

## FL-RPT-01 — Review vehicle profitability

1. Open Reports → Vehicle P&L.
2. Select date range and optional city, vehicle, category, or ownership filters.
3. View revenue, direct expenses, owner share, contribution, and utilization.
4. Drill into a figure to see source bookings/expenses.
5. Export when permission and export feature are enabled.

Empty result explains whether no activity exists or filters excluded all data.

## FL-SET-01 — Invite an agency user (pilot)

1. Agency Owner opens Settings → Users & Roles.
2. Enter email/phone, name, role, and branch scope.
3. Review generated permission summary.
4. Send invitation.
5. Invitee verifies identity and activates account.
6. Audit log records invitation, acceptance, role, and scope.

## FL-SYS-01 — Recover from a failed mutation

Applies to create/edit/status/payment/expense/payout actions.

1. User submits an action.
2. Button shows progress and prevents duplicate submission.
3. If validation fails, focus moves to a clear error summary/first invalid field.
4. If network/server fails, preserve form data and show a safe retry.
5. If conflict occurs, show the changed record state and let user reload/compare.
6. Success appears only after the system confirms persistence.

