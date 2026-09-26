# VibeRent Product Scope

## 1. Product statement

VibeRent is an operations system for local car-rental agencies that manage both agency-owned and third-party owner-managed vehicles. It should give owners and agents a reliable view of availability, bookings, handovers, customers, expenses, profitability, and owner settlements on desktop and mobile.

The initial product should feel complete and believable using deterministic local data. Persistence, production authentication, payments, storage, and external communications enter scope only through an explicit product decision.

## 2. Product goals

1. Make current fleet availability understandable in seconds.
2. Let an agent create a valid booking without schedule conflicts.
3. Make pickup, check-out, return, and check-in operationally reliable.
4. Keep customer, vehicle, payment, expense, and document history connected.
5. Calculate trustworthy vehicle profitability and managed-owner balances.
6. Preserve practical workflows on a phone for counter and field agents.
7. Build shared interaction patterns so later modules remain consistent.

## 3. Non-goals for the frontend prototype

- Real payment capture or bank settlement.
- Production authentication or password recovery.
- Real WhatsApp, SMS, or email delivery.
- Real file storage, OCR, or document verification.
- E-signature with legal audit guarantees.
- GPS/telematics or automatic mileage collection.
- Customer or owner self-service portals.
- Multi-currency accounting or tax filing.
- Production database, API, or offline synchronization.

These may be represented by realistic UI states, but must be labeled as simulated or deferred.

## 4. Primary users

### Agency Owner

- Reviews revenue, utilization, expenses, and profitability.
- Manages branches, users, owner agreements, and payout approvals.
- Can access all operational and financial data.

### Fleet Manager

- Maintains vehicles, availability, maintenance states, and documents.
- Coordinates vehicle movement between cities or branches.
- Reviews utilization and service alerts.

### Rental Agent

- Creates bookings and customers.
- Records deposits and payments.
- Performs pickup/check-out and return/check-in workflows.
- Has limited access to sensitive financial or administrative settings.

### Accountant

- Records and verifies expenses, payments, refunds, and owner payouts.
- Produces financial reports.
- Does not change operational vehicle state without permission.

### Managed Vehicle Owner

- Future portal user who sees only their vehicles, statements, and payouts.
- In the initial system, agency staff maintain owner records on their behalf.

### System Administrator

- Future production role for tenant support, audit, and account recovery.
- Not an agency operational role.

## 5. Core navigation

1. Dashboard
2. Vehicles
3. Bookings
4. Customers
5. Expenses
6. Reports
7. Owners
8. Settings

Contextual workflows such as check-out, check-in, payments, maintenance, and documents are entered from their related entity rather than becoming permanent top-level navigation items.

## 6. Market defaults

- Currency: PKR.
- Time zone: Asia/Karachi.
- Date display: `DD MMM YYYY` in dense UI and localized long date in summaries.
- Time display: 12-hour time with AM/PM unless agency settings change it.
- Cities: Lahore, Islamabad, Rawalpindi, Karachi as default fixtures.
- Phone format: Pakistani mobile or landline presentation.
- Registration plates: plausible fictional Pakistani plates.
- Identity values: fictional CNIC/license formats only; never use real-person sensitive data.

## 7. Product principles

- Operations first: prioritize next actions and exceptions over decorative analytics.
- One source of truth: availability, booking status, payment balance, and owner balance must derive from recorded entities.
- Safe changes: destructive actions require confirmation; finalized financial records should be reversed rather than silently edited.
- Reusable interaction language: shared tables, filters, forms, status badges, action menus, dialogs, and feedback.
- Mobile parity: primary tasks remain usable without horizontal table scrolling.
- Explain unavailable actions: disabled controls include a reason or upcoming requirement.
- Auditability: important state changes carry actor, timestamp, and before/after context once persistence exists.

## 8. Product success measures

### Operational metrics

- Median booking creation time under 3 minutes.
- No confirmed overlapping bookings for one vehicle.
- Pickup and return queues reflect the current day correctly.
- Outstanding balances are visible before booking closure.
- Maintenance and document expiry exceptions are visible before assignment.

### Usability metrics

- Core workflows usable at 390px and desktop widths.
- All form errors identify the field and corrective action.
- Keyboard users can navigate forms, menus, dialogs, and tables.
- No visible enabled control is non-functional.

### Business metrics

- Utilization can be calculated by vehicle, category, city, and period.
- Revenue, direct expenses, owner share, and net contribution reconcile.
- Owner statement balances match underlying completed rentals and payouts.

## 9. Release definitions

### Prototype release

A cohesive, navigable frontend using deterministic mock repositories. Primary controls work locally and important empty, error, validation, and confirmation states exist.

### Pilot release

Persistent multi-agency data, authentication and roles, file storage, audit logs, production-grade validation, backups, and real operational onboarding.

### General availability

Operational reliability, security review, observability, support processes, data export/retention policies, and validated billing or payments where included.

