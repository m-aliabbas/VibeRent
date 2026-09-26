# VibeRent Conceptual Data Model

This is a domain model, not a commitment to Prisma, Drizzle, or a specific database library. Persistence technology remains an explicit open decision in [DECISIONS.md](./DECISIONS.md).

## 1. Tenancy and identity

### Agency

- `id`, `name`, `slug`, `status`
- locale, currency, time zone
- legal/contact/profile fields
- created/updated timestamps

### Branch

- agency, city, name, address, coordinates (optional)
- contact, hours, pickup instructions, active state

### User

- agency, identity-provider ID, name, email/phone, status
- last active time and preferences

### Role / Permission / UserBranch

- Role assignment and optional branch scope.
- Start with system roles; model permissions so future refinement is possible.

## 2. Fleet

### Vehicle

- agency, plate normalized/display, make, model, year, color, category
- transmission, fuel, seats/features
- ownership type, current branch/city, operational status
- odometer, base rate, notes, archived time

### VehicleOwner

- agency, individual/company name, phone/email/address
- identity/tax and payout details with appropriate encryption/masking
- status and notes

### ManagementAgreement

- vehicle, owner, version, effective start/end
- share method/value, calculation basis, expense responsibility
- minimum guarantee, payout frequency, withholding/adjustment terms
- status and approval metadata

### VehiclePhoto

- vehicle, storage key, ordering, cover flag, caption, uploaded by/time

### VehicleDocument

- vehicle, type, number, issue/expiry date, storage key, verification state
- required flag, notes, uploaded/verified metadata

### VehicleStatusEvent

- vehicle, from/to status, effective time, reason, notes, actor

### VehicleTransfer

- vehicle, origin/destination branch, planned/actual times
- status, assigned user/driver, notes

### MaintenanceCase

- vehicle, category, status, scheduled/start/completion times
- odometer trigger/reading, vendor, estimate/actual cost, notes
- blocking flag and next-service details

### AvailabilityBlock

- vehicle, start/end, type, reason, related entity, creator

## 3. Customers

### Customer

- agency, display/legal name, normalized phones, email, address/city
- identity type/number, birth date if required, status, notes
- sensitive fields stored/masked according to policy

### DrivingLicense

- customer, number, issuing authority/country, classes, issue/expiry dates
- verification state and document storage keys

### CustomerDocument

- customer, type, number, expiry, storage key, verification metadata

### CustomerRestriction

- customer, severity, reason, evidence/note, effective/review/closed dates
- created/closed by and status

### EmergencyContact

- customer, name, relationship, phone

## 4. Bookings and operations

### Booking

- agency, booking number, status, source, assigned agent
- customer, vehicle, pickup/return branch/location
- scheduled pickup/return and actual pickup/return
- rate/policy snapshot, currency, totals, balance state
- cancellation/no-show metadata, notes, created/updated metadata

### BookingLineItem

- booking, type, description, quantity, unit, unit amount
- subtotal, discount/tax metadata if applicable
- source/configuration reference and snapshot

### BookingExtra

- booking, extra definition/snapshot, quantity, charge method, amount

### BookingAmendment

- booking, sequence, change summary, previous/new snapshots
- price difference, reason, actor/time

### VehicleHandover

- booking, type (`checkout` or `checkin`), status
- agent/time, odometer, fuel, checklist, notes, location
- customer acceptance and completion metadata

### HandoverPhoto

- handover, category/area, storage key, annotation, captured time

### DamageRecord

- booking/handover/vehicle, area, severity, description, photos
- estimated/final charge, maintenance link, status

### RentalAgreement

- booking, template version, generated storage key, terms snapshot
- customer/agent acceptance and signature metadata

## 5. Finance

### PaymentTransaction

- agency, booking/customer, transaction type
- amount/currency, method, account, reference, occurred/recorded times
- status, reversal/original relationship, actor, note

Transaction types include rental payment, deposit receipt, deposit application, refund, reversal, credit, write-off, and adjustment.

### Expense

- agency, date, amount/currency, category, vendor, description
- vehicle, booking, owner, branch (as applicable)
- responsibility, payment method/account, receipt storage key
- status, submit/approve/reject/reverse metadata

### OwnerStatement

- owner, period, opening balance, calculated totals, adjustments
- payable/paid/closing balance, status, approval metadata

### OwnerStatementLine

- statement, line type, source booking/expense/adjustment
- description, gross basis, percentage/fixed logic, amount

### OwnerPayout

- owner, statement, amount, method, reference, date
- proof storage key, status, recorder/approver

## 6. Configuration

### RateCard / RateRule

- agency, branch/city, category or vehicle target
- effective dates, base rate, duration band, weekday/season rules
- precedence/priority and active state

### ExtraDefinition

- agency, name, charge method, default price, active state

### ExpenseCategory / Vendor

- agency-configurable references with archive state.

### AgencyPolicy

- booking duration/rounding, turnaround buffer, deposit defaults
- cancellation, late fee, distance, fuel, discount/override thresholds
- required documents, expiry lead time, checkout checklist requirements
- effective date/version

### NumberSequence

- agency, entity type, prefix, next value, reset policy

### CommunicationTemplate

- agency, event/type, channel, locale, subject/body, active/version

## 7. Platform records

### AuditEvent

- agency, actor, action, entity type/ID, timestamp
- safe before/after summary, reason, request/correlation metadata

### Notification

- agency/user, category, title/body, entity link
- severity, read time, created time

### FileAsset

- agency, storage key, media type, byte size, checksum
- entity relationship, classification, uploader/time, retention/deletion metadata

### ImportJob / ImportRowError

- agency, type, file, status, totals, actor/time
- per-row validation error without storing secrets in logs

## 8. Relationship summary

```text
Agency
├── Branches
├── Users ── Roles / Branch scopes
├── Vehicles ── Photos / Documents / Status events / Maintenance / Blocks
│   └── Management Agreements ── Vehicle Owner
├── Customers ── Documents / License / Restrictions
├── Bookings ── Customer + Vehicle + Branches
│   ├── Line items / Extras / Amendments
│   ├── Handovers ── Photos / Damage
│   └── Payments / Agreement
├── Expenses ── optional Vehicle / Booking / Owner
└── Owners ── Statements ── Lines / Payouts
```

## 9. Integrity requirements

- Unique agency-scoped normalized plate, booking number, and sequence values.
- Interval indexes for booking/block/maintenance availability queries.
- Financial amounts use consistent integer units and currency.
- Foreign keys prevent removal of referenced business records.
- Status values constrained to defined enumerations or reference tables.
- Soft archive metadata is explicit; default queries exclude archived records.
- Optimistic version or updated timestamp supports safe concurrent edits.
- Multi-step booking confirmation, payment posting, and statement approval use transactions.

## 10. Deferred schema decisions

- Database and ORM selection.
- Exact tenant isolation approach.
- Whether rate rules are normalized or stored as versioned JSON policy.
- Ledger-grade accounting versus operational transaction model.
- File provider and malware scanning flow.
- Search engine versus database search.
- Data retention and customer deletion/anonymization requirements.

