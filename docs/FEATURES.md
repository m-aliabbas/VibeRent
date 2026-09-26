# VibeRent Feature Catalog

Priority meanings: `P0` is required for a viable daily workflow, `P1` is important for the first operational release, `P2` is valuable after core stability, and `P3` is future scope.

## 1. Application Shell and Navigation

### F-SHL-01 — Responsive application shell (`P0`)

- Persistent desktop sidebar and accessible mobile drawer.
- Current route is visually and semantically identifiable.
- Header contains global search, notifications, and user menu.
- Browser history and direct URLs work for every module and record detail.
- Mobile drawer closes on navigation, overlay click, and Escape.

Acceptance criteria:

- No horizontal page overflow at supported widths.
- Every navigation item reaches a valid route or an explicit planned-state screen.
- Focus is restored after closing menus and dialogs.

### F-SHL-02 — Global search (`P1`)

- Search vehicles, bookings, customers, and owners from one entry point.
- Group results by entity type.
- Support keyboard shortcut, arrow navigation, recent searches, and empty state.
- Result selection opens the entity detail page.
- Permission-restricted entities never appear.

### F-SHL-03 — Notifications and attention center (`P1`)

- Surface pickups, returns, overdue balances, expiring documents, maintenance, and owner payouts.
- Read/unread state, category, entity link, and timestamp.
- Mark one or all as read.
- Notification delivery integrations remain deferred until explicitly selected.

## 2. Dashboard

### F-DSH-01 — Operational summary (`P0`)

- Total fleet, active rentals, today’s collected revenue, and utilization.
- Values derive from the same filters and time zone.
- Cards link to the relevant filtered module where useful.
- Loading, partial-data, and error states do not display misleading zeroes.

### F-DSH-02 — Today’s pickups and returns (`P0`)

- Ordered schedule with event type, time, vehicle image, vehicle/plate, customer, and location.
- Quick access to booking details and handover workflow.
- Late, incomplete-document, unpaid-deposit, and conflict warnings.
- Mobile presentation prioritizes type, time, vehicle, and customer.

### F-DSH-03 — Quick actions (`P0`)

- Create booking, add vehicle, record expense, and open reports.
- Permission-aware and usable by keyboard.
- Each action opens the corresponding workflow instead of a dead placeholder.

### F-DSH-04 — Recent activity (`P1`)

- Booking, payment, return, expense, maintenance, and payout events.
- Actor, time, summary, and entity link.
- Filter by event type and open full audit history later.

### F-DSH-05 — Exceptions (`P1`)

- Overdue returns, overdue balances, maintenance due, expiring documents, and owner payouts awaiting approval.
- Severity and required action are visible without relying on color alone.

## 3. Vehicles

### F-VEH-01 — Vehicle list (`P0`, prototype implemented)

- Search by plate, make, and model.
- Filter by status, city, ownership, category, and later document/maintenance health.
- Sort by plate, vehicle, city, status, and daily rate.
- Paginate results and adapt to mobile cards.
- View, edit, archive/remove, and context-specific actions.

### F-VEH-02 — Vehicle create/edit (`P0`, prototype implemented)

- Plate, make, model, year, color, category, city, rate, status, transmission, and fuel type.
- Ownership type: agency-owned or managed.
- Managed vehicles require an owner and commercial terms.
- Plate uniqueness is case-insensitive within an agency.
- Validation preserves entered data after errors.

### F-VEH-03 — Vehicle detail (`P0`)

- Overview, current status, location, ownership, rates, documents, maintenance, expenses, bookings, and financial summary.
- Timeline of operational changes.
- Context actions: create booking, schedule maintenance, transfer city, edit, or archive.

### F-VEH-04 — Vehicle media and documents (`P1`)

- Cover photo and gallery.
- Registration, insurance, fitness, token/tax, and other document types.
- Issue and expiry dates, document number, file, notes, and verification state.
- Expiry warnings with configurable lead time.
- Prototype uses simulated uploads; pilot requires authenticated storage.

### F-VEH-05 — Vehicle status and availability (`P0`)

- Statuses: Available, Booked, Checked Out, Maintenance, Out of Service, Archived.
- Availability is calculated from blocking bookings and manual blocks, not only the displayed status.
- Status transitions record reason, actor, and time.
- Invalid transitions explain the blocking condition.

### F-VEH-06 — City/branch transfer (`P1`)

- Select destination, departure/arrival time, driver/agent, notes, and transfer status.
- Prevent bookings in a city before confirmed arrival.
- Preserve location history.

### F-VEH-07 — Rate cards (`P1`)

- Base daily rate by vehicle or category and city.
- Optional duration bands, weekend/season adjustment, delivery charge, and extra-kilometre rate.
- Effective dates and precedence are explicit.
- Quote stores a rate snapshot so later rate changes do not alter confirmed bookings.

### F-VEH-08 — Maintenance (`P1`)

- Schedule service by date or odometer.
- Categories, vendor, estimated/actual cost, downtime, notes, and attachments.
- A blocking maintenance event removes the vehicle from availability.
- Service completion updates next-service date/odometer.

## 4. Availability and Calendar

### F-AVL-01 — Availability search (`P0`)

- Inputs: pickup city/branch, pickup date/time, return date/time, category, and optional features.
- Results exclude conflicting bookings, blocking maintenance, out-of-service vehicles, and impossible transfers.
- Explain why a vehicle is unavailable when opened from fleet context.

### F-AVL-02 — Fleet timeline (`P0`)

- Vehicle rows and date/time columns.
- Booking blocks show status, customer, dates, and conflict state.
- Day, week, and month density options.
- Filters for city, category, vehicle, ownership, and booking status.
- Clicking an empty period starts booking creation with context prefilled.
- Drag rescheduling is deferred until conflict handling and audit are production-ready.

### F-AVL-03 — Manual availability block (`P1`)

- Block a vehicle for maintenance, transfer, internal use, or other reason.
- Start/end time, blocking reason, notes, and creator.
- Block creation checks existing bookings and requires conflict resolution.

## 5. Bookings and Rentals

### F-BKG-01 — Booking list (`P0`)

- Search by booking number, customer, phone, plate, or vehicle.
- Filter by status, dates, city, payment state, source, and assigned agent.
- Mobile cards prioritize booking, vehicle, customer, dates, balance, and status.
- Actions depend on booking state.

### F-BKG-02 — New booking wizard (`P0`)

1. City/branch and pickup/return dates and times.
2. Available vehicle selection.
3. Existing or new customer.
4. Pricing, discounts, deposit, extras, and payment plan.
5. Review terms and confirm.

Requirements:

- Validate end after start and agency minimum/maximum duration.
- Recheck availability immediately before confirmation.
- Show line-item pricing and balance due.
- Save draft and allow cancellation without creating a blocking booking.

### F-BKG-03 — Booking detail (`P0`)

- Booking number/status, customer, vehicle, schedule, locations, pricing, payments, balance, notes, documents, and activity.
- Clear next action based on status.
- Amend, cancel, confirm, check out, check in, collect payment, and share/print summary where allowed.

### F-BKG-04 — Amend or reassign (`P0`)

- Change dates, times, location, vehicle, extras, and price before completion.
- Availability recheck for schedule or vehicle changes.
- Show pricing difference and capture reason.
- Preserve amendment history.

### F-BKG-05 — Cancellation and no-show (`P0`)

- Cancellation reason, fee/refund calculation, and optional internal note.
- Release availability immediately after cancellation.
- No-show is separately reportable.
- Paid amounts are refunded or converted to credit through explicit transactions.

### F-BKG-06 — Check-out/handover (`P0`)

- Verify customer identity/license and required payment/deposit.
- Record agent, time, odometer, fuel level, condition checklist, photos, accessories, and notes.
- Capture agreement acceptance/signature later.
- Completing checkout changes booking to Checked Out and vehicle to Checked Out.

### F-BKG-07 — Check-in/return (`P0`)

- Record actual return time, odometer, fuel level, condition, photos, and returned accessories.
- Calculate lateness, excess distance, fuel, damage, toll, and other charges.
- Record waiver/approval when a charge is omitted.
- Complete after final amount and payment state are reviewed.

### F-BKG-08 — Booking extras (`P1`)

- Driver, delivery/collection, child seat, additional driver, insurance option, and configurable other extras.
- Charge type: per booking, per day, or quantity.
- Availability-limited extras may have inventory later.

### F-BKG-09 — Booking source and assignment (`P1`)

- Walk-in, phone, WhatsApp, website, partner, or other source.
- Assigned agent and optional commission metadata.
- Source and agent reporting.

## 6. Customers

### F-CUS-01 — Customer list and profile (`P0`)

- Search by name, phone, CNIC/passport, license, or booking number.
- Contact details, identity summary, status, risk flags, outstanding balance, and rental history.
- Active, Blacklisted, or Archived status with reason.

### F-CUS-02 — Customer create/edit (`P0`)

- Name, phone, alternative phone, email, address, city, CNIC/passport, license, emergency contact, and notes.
- Detect likely duplicates by normalized phone and identity number.
- Sensitive identifiers are masked outside authorized contexts.

### F-CUS-03 — Customer documents (`P1`)

- CNIC/passport front/back, driving license, and optional supporting documents.
- Expiry validation and verification state.
- Prototype simulates uploads; pilot requires secure access and retention rules.

### F-CUS-04 — Risk and blacklist (`P1`)

- Record reason, severity, date, evidence, and creator.
- Booking creation displays a blocking or warning decision according to policy.
- Removing a blacklist entry preserves history.

### F-CUS-05 — Customer balance and credits (`P1`)

- Outstanding booking balances, refundable deposits, credits, refunds, and write-offs.
- Transactions link to the originating booking.

## 7. Payments and Deposits

### F-PAY-01 — Payment recording (`P0`)

- Cash, bank transfer, card/manual terminal, wallet, or other method.
- Amount, date/time, reference, receiving account, booking, payer, and note.
- Issue a local receipt view; production receipt delivery is later.

### F-PAY-02 — Deposit management (`P0`)

- Required, received, held, partially applied, refunded, forfeited, and released states.
- Deposit is separate from rental revenue until applied.
- Refund or application creates traceable transactions.

### F-PAY-03 — Refund, reversal, and write-off (`P1`)

- Do not delete posted payments.
- Reverse with reason and linked compensating transaction.
- Refund cannot exceed refundable received amount.
- Write-off requires role permission and reason.

### F-PAY-04 — Outstanding balances (`P1`)

- Aging by customer and booking.
- Due date, reminders, partial collection, and collection notes.
- Dashboard exception when overdue.

## 8. Expenses

### F-EXP-01 — Expense list (`P0`)

- Search and filter by category, vehicle, booking, owner, vendor, city, date, payment state, and amount.
- Totals reflect active filters.
- Receipt indicator and verification state.

### F-EXP-02 — Record expense (`P0`)

- Date, amount, category, description, vendor, payment method, city, vehicle, optional booking, owner allocation, receipt, and notes.
- Categories include Maintenance, Fuel, Insurance, Cleaning, Tolls, Fines, Registration, Tax, Delivery, and Other.
- Vehicle is required for direct vehicle costs; reason is required for unallocated expenses.

### F-EXP-03 — Expense approval (`P1`)

- Draft, Submitted, Approved, Rejected, Reversed.
- Configurable threshold or category can require approval.
- Approval records actor, time, and comment.

### F-EXP-04 — Recurring costs (`P2`)

- Insurance, tracker, lease, parking, and other recurring schedules.
- Generate draft expenses, not irreversible automatic postings.

## 9. Owners and Managed Fleet

### F-OWN-01 — Owner directory (`P0`)

- Contact, identity/company details, payout method, tax/notes, active vehicles, current payable balance, and status.
- Multiple vehicles per owner.

### F-OWN-02 — Management agreement (`P0`)

- Effective dates, revenue share method, share percentage/fixed fee, expense responsibility, minimum guarantee, withholding, payout schedule, and notes.
- Terms are versioned; completed periods use the applicable historical version.

### F-OWN-03 — Owner statement (`P0`)

- Opening balance, eligible rental revenue, owner share, agency share, owner-chargeable expenses, adjustments, payouts, and closing balance.
- Drill down to every contributing booking and expense.
- Draft, Reviewed, Approved, Paid, and Void states.

### F-OWN-04 — Owner payout (`P0`)

- Amount, statement/period, payment method, reference, date, proof, and approver.
- Prevent overpayment unless an authorized advance is explicitly recorded.

### F-OWN-05 — Owner portal (`P3`)

- Read-only vehicles, bookings summary, statements, documents, and payouts.
- Separate authentication and strict tenant/owner scoping.

## 10. Reports and Analytics

### F-RPT-01 — Vehicle profit and loss (`P0`)

- Rental revenue, adjustments, direct expenses, owner share, contribution, utilization, and revenue per available day.
- Filter by period, city, vehicle, category, and ownership.
- Values reconcile to transactions and expenses.

### F-RPT-02 — Revenue and collections (`P1`)

- Booked revenue versus collected cash.
- Breakdowns by date, city, vehicle/category, source, agent, and payment method.
- Outstanding and overdue balances.

### F-RPT-03 — Utilization (`P1`)

- Available hours/days, booked, checked-out, maintenance downtime, and utilization percentage.
- Exclude archived periods and configurable non-operating time.

### F-RPT-04 — Expense analysis (`P1`)

- Category, vehicle, city, vendor, owner responsibility, and period.
- Compare expense to revenue and identify anomalies.

### F-RPT-05 — Owner financial reports (`P1`)

- Payable balance, statement aging, payout history, and managed-vehicle performance.

### F-RPT-06 — Export and print (`P2`)

- CSV/XLSX for detailed data; PDF for formatted statements and summaries.
- Exports respect filters, permissions, masking, and time zone.

## 11. Settings and Administration

### F-SET-01 — Agency profile (`P1`)

- Business name, logo, phone, email, address, registration/tax details, locale, currency, and time zone.

### F-SET-02 — Branches and cities (`P1`)

- Branch name, city, address, contact, opening hours, active state, and pickup instructions.

### F-SET-03 — Users and roles (`P1`, pilot)

- Invite/deactivate users and assign roles/branch scope.
- Agency Owner, Fleet Manager, Rental Agent, and Accountant defaults.
- Custom permissions later if required.

### F-SET-04 — Numbering and policy (`P1`)

- Booking/receipt/statement prefixes, cancellation policy, deposit defaults, document warning days, and booking rules.

### F-SET-05 — Expense and extras configuration (`P2`)

- Manage categories, extras, default charges, vendors, and approval thresholds.

### F-SET-06 — Communication templates (`P2`)

- Booking confirmation, pickup reminder, return reminder, payment receipt, and owner statement templates.
- Delivery integrations remain separate.

### F-SET-07 — Data import/export and backup (`P2`, pilot)

- Validated imports for vehicles, customers, opening balances, and owners.
- Export agency data and record import errors by row.

## 12. Authentication, Security, and Audit

### F-SEC-01 — Authentication (`P0`, pilot)

- Sign in, sign out, session expiry, password recovery or identity-provider equivalent.
- Rate limiting and secure session handling.

### F-SEC-02 — Authorization and tenant isolation (`P0`, pilot)

- Every record belongs to an agency.
- Role and branch scope enforced on server and database access, not only in UI.
- Unauthorized actions return safe errors and are logged.

### F-SEC-03 — Audit log (`P0`, pilot)

- Actor, agency, action, entity, record ID, timestamp, and safe before/after summary.
- Cover booking status, pricing changes, payment reversal, expense approval, owner terms, permissions, and archive/restore.
- Audit records are append-only.

### F-SEC-04 — Sensitive data handling (`P0`, pilot)

- Mask identity data by default.
- Encrypt sensitive data at rest where required.
- Private files use expiring access URLs.
- Define retention and deletion policy before production launch.

## 13. Platform and Reliability

### F-PLT-01 — Feedback states (`P0`)

- Loading, skeleton, empty, filtered-empty, validation, permission, error, offline, and retry states.
- Toasts confirm reversible changes; critical outcomes remain visible in-page.

### F-PLT-02 — Responsive and accessible interface (`P0`)

- Keyboard support, labeled controls, visible focus, dialog focus management, sufficient contrast, touch targets, and reduced motion.
- Tables convert to prioritized cards or columns on mobile.

### F-PLT-03 — Observability (`P1`, pilot)

- Structured server logs, error tracking, health checks, and performance monitoring.
- Correlation ID for supportable failures.

### F-PLT-04 — Backup and recovery (`P0`, pilot)

- Automated database backups, retention, restore procedure, and periodic restore tests.
- File backup and recovery strategy aligned with storage provider.

