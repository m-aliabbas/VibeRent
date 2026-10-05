# WhatsApp, CNIC OCR, booking numbers, and dashboard plan

## Product contract

- Only the agency owner number configured by an agency owner or admin can issue inbound commands. Group messages, status messages, messages sent by VibeRent itself, and all other senders are ignored.
- Each agency owns one WhatsApp session and one authorized owner number. Baileys remains a long-lived desktop/server process; Route Handlers and Server Actions only control and query it.
- A simple agency-scoped booking number is allocated when the booking wizard opens. Allocation happens in a SQLite immediate transaction, so concurrent starts cannot receive the same number. Gaps are allowed when a draft expires.
- CNIC images are private files, never SQLite blobs. They live under an agency/customer storage prefix with restrictive permissions and metadata in `private_files`.
- OCR happens outside a database transaction. The final customer/file/audit update is short and transactional. Model output is always editable by staff and never treated as verified identity.

## Delivery slices

### 1. Booking reference and dashboard finance

- Add `booking_number_counters`, `booking_drafts`, and nullable `bookings.public_number` for backward compatibility.
- Allocate/reuse a 24-hour draft number for the signed-in actor and display it throughout the wizard.
- Consume that draft during confirmation in the same immediate transaction as availability re-check, booking insert, and audit event.
- Show today income with month-to-date income, and today approved expenses with month-to-date approved expenses.

### 2. WhatsApp control plane

- Add an agency-scoped WhatsApp settings record: session ID, normalized owner number, listening toggle, and safe connection metadata.
- Add a top-level WhatsApp tab for owners/admins with QR/pairing login, connection state, authorized owner number, listen toggle, disconnect, and command reference.
- Keep QR and live socket state in a process-global runtime registry. Persist credentials only in the dedicated encrypted/private WhatsApp SQLite store. Run exactly one socket per agency session.
- Start configured listeners from the desktop startup lifecycle and stop them during graceful shutdown. Never start a Baileys socket inside an API request.

### 3. Owner-only command router

- Parse commands case-insensitively but require exact command tokens and validated arguments.
- Port the useful `vibe_pos` pattern: sender normalization (including LID-to-phone resolution), owner allow-listing, `/help`, aliases, compact text replies, and safe error responses.
- VibeRent command set:
  - `/summary`, `/today`, `/income [today|month]`, `/expense [today|month]`
  - `/cars`, `/car <plate>`, `/available <YYYY-MM-DD> <YYYY-MM-DD>`
  - `/booking <number>` and `/car-booking <plate>`
  - `/pickups`, `/returns`, `/due`, `/help`
- Command handlers call application services with a trusted system context scoped to the configured agency. They do not query unrestricted tables directly.

### 4. CNIC image ingestion

- Accept image captions `/id1 NUMBER`, `/ID1 NUMBER`, `/id-1 NUMBER`, or `/front NUMBER` for the front; `/id2 NUMBER`, `/id-2 NUMBER`, or `/back NUMBER` for the back.
- Resolve `NUMBER` through `bookings.public_number` within the listener's agency, then resolve the booking customer.
- Validate MIME type and size before download/storage. Write to `private-files/<agency>/customers/<customer>/customer_cnic/` with random storage names and `0600` permissions.
- Record front/back classifications in `private_files`, retain the WhatsApp message ID for idempotency, and append audit events without logging CNIC values or storage paths.
- Run OpenAI OCR with `store: false`. Merge front/back fields `{name, cnic, dob, address}` only when confidently read; preserve existing non-empty values on ambiguity and flag the customer for staff review.
- Show extracted fields and both images on the customer step/profile with an explicit “OCR—review required” state and normal edit controls.

### 5. Hardening and release

- Add idempotency for duplicate WhatsApp deliveries, per-owner rate limits, command audit records, redacted structured logs, and retry-safe replies.
- Add unit tests for aliases and sender authorization; temporary-SQLite tests for booking allocation, tenant isolation, idempotency, and CNIC attachment rollback; contract/UI tests for setup permissions and states.
- Verify desktop restart/reconnect, encrypted backup coverage, mobile/desktop layouts, console output, lint, typecheck, build, migrations, seed, and database checks.

## Operational constraints

- Baileys is an unofficial WhatsApp Web integration and carries account-ban/policy risk. Do not use it for unsolicited or bulk messaging.
- The current supported topology is one long-running VibeRent instance with persistent storage. Serverless functions and multiple processes controlling the same WhatsApp session are unsupported.
- Real CNIC retention/deletion rules and operator consent must be agreed before production use.
