# VibeRent Decision Log

Use this file for durable product and architecture decisions. Do not record casual implementation details. Accepted decisions remain in the log even if superseded.

## Accepted decisions

### D-001 — Frontend-first prototype

- **Status:** Accepted
- **Date:** 26 September 2026
- **Decision:** Build a cohesive frontend prototype with deterministic local mock repositories before selecting production persistence, authentication, or integrations.
- **Reason:** The current goal is to validate workflows and visual direction without prematurely fixing backend contracts.
- **Consequences:** Client changes may reset on refresh. UI/service boundaries should make later replacement possible.

### D-002 — VibeRent visual direction

- **Status:** Accepted
- **Date:** 26 September 2026
- **Decision:** Use primary blue `#006FE6`/`#0878F9`, dark navy/charcoal text, white cards, restrained pale canvas, subtle borders/shadows, and approximately 12px radii.
- **Reason:** Matches approved product notes and supplied dashboard references.
- **Consequences:** Avoid glassmorphism, neon dashboards, excessive gradients, and decorative color without semantic purpose.

### D-003 — Vehicles as the reference CRUD module

- **Status:** Accepted
- **Date:** 26 September 2026
- **Decision:** Complete reusable list, form, detail, status, confirmation, loading, error, and empty patterns in Vehicles before duplicating them in Customers, Owners, and Expenses.
- **Reason:** Keeps interaction behavior and architecture consistent.
- **Consequences:** Later CRUD modules should adapt the pattern but retain their own domain rules.

### D-004 — Pakistani market defaults

- **Status:** Accepted
- **Date:** 26 September 2026
- **Decision:** Default prototype data uses PKR, Asia/Karachi, Pakistani cities, plausible fictional names, plates, phone/CNIC formats, and rental terminology.
- **Reason:** The intended initial market is local Pakistani agencies.
- **Consequences:** Do not introduce USD, US addresses, or real sensitive identity data in fixtures.

### D-005 — Shared product requirements and tracking IDs

- **Status:** Accepted
- **Date:** 26 September 2026
- **Decision:** Requirements, flows, rules, tickets, and decisions use stable IDs documented in `docs/README.md`.
- **Reason:** Enables traceability between product definition, implementation, and QA.
- **Consequences:** New tickets must link to features/flows and completed features require verification evidence.

### D-006 — Financial corrections are append-only

- **Status:** Accepted for product design
- **Date:** 26 September 2026
- **Decision:** Posted payments, approved expenses, payouts, and approved statements are corrected through reversals, voids, or adjustments rather than silent overwrite/delete.
- **Reason:** Financial trust and auditability.
- **Consequences:** UI and future data model must preserve original and correcting records.

## Open decisions

### D-101 — Database and ORM

- **Status:** Open; blocks pilot backend
- **Options:** PostgreSQL with Prisma, PostgreSQL with Drizzle, or another explicitly justified stack.
- **Decision criteria:** Transaction/concurrency support, schema migration quality, type safety, team familiarity, tenant strategy, operational support.
- **Do not decide during:** Frontend-only prototype work.

### D-102 — Authentication provider

- **Status:** Open; blocks pilot backend
- **Options:** Auth.js/NextAuth, Clerk, managed identity provider, or agency-owned credentials.
- **Decision criteria:** Multi-tenant membership, roles, account recovery, MFA roadmap, regional availability, cost, data/privacy needs.

### D-103 — Tenant and branch isolation

- **Status:** Open; blocks pilot backend
- **Questions:** Shared schema with agency key, database row-level security, separate schema/database, branch scope enforcement.
- **Required artifact:** Threat model and automated cross-tenant authorization tests.

### D-104 — File storage and sensitive documents

- **Status:** Open; blocks document pilot
- **Questions:** Provider, private bucket strategy, signed URL lifetime, malware scanning, image processing, backups, retention, customer deletion/anonymization.

### D-105 — Operational finance versus full accounting

- **Status:** Open
- **Question:** Does VibeRent track operational payments/expenses only, or become a ledger/double-entry accounting system?
- **Recommendation for MVP:** Operational subledger with export/integration boundary; do not claim accounting completeness.

### D-106 — Deposit accounting and custody

- **Status:** Open before financial pilot
- **Questions:** Liability treatment, cash/bank account mapping, partial application, refund approval, forfeiture policy, receipt numbering.

### D-107 — Availability buffers and pricing duration

- **Status:** Open before booking implementation
- **Questions:** Default turnaround buffer, grace time, 24-hour versus calendar-day charging, fractional-day rounding, minimum booking duration.
- **Plan:** Make policy configurable but select safe defaults for prototype fixtures.

### D-108 — Booking holds

- **Status:** Open before production booking concurrency
- **Questions:** Whether drafts create temporary holds, hold duration, renewal, expiry, and agent visibility.

### D-109 — Owner share basis

- **Status:** Open before owner statement implementation
- **Options:** Gross booked rental, collected rental, net of discount/refund, net of selected fees, or configurable agreement basis.
- **Requirement:** Statement must make basis explicit and version terms.

### D-110 — Taxes and invoicing

- **Status:** Open
- **Questions:** Agency tax obligations, invoice/receipt distinction, tax-inclusive pricing, numbering, retention, and export requirements.

### D-111 — Communication providers

- **Status:** Deferred
- **Options:** WhatsApp Business provider, SMS, email, or manual share links.
- **Dependency:** Approved templates, consent, delivery status, cost, and data-sharing policy.

### D-112 — PDF contracts and e-signature

- **Status:** Deferred
- **Questions:** Legal requirements, template versioning, signature provider versus local capture, signer identity, audit evidence, and retention.

### D-113 — Hosting, observability, and recovery

- **Status:** Open before pilot
- **Questions:** Hosting provider/region, error tracking, log retention, uptime target, database/file backups, restore objectives, and incident ownership.

## Decision template

```md
### D-XXX — Decision title

- **Status:** Proposed / Accepted / Superseded / Rejected
- **Date:** YYYY-MM-DD
- **Decision:**
- **Context:**
- **Options considered:**
- **Reason:**
- **Consequences:**
- **Follow-up tickets:**
```

