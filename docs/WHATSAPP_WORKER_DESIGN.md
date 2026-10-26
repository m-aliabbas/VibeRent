# WhatsApp and background worker design

Status: proposed · Target branch: `codex/postgresql-web` · Date: 2026-10-26

This document designs the move of WhatsApp, PDF delivery, OCR and scheduled work out of the
Next.js web process. It is grounded in the code on `codex/postgresql-web` as of `cddbb3b`.

---

## 1. Why the app is slow today

Everything WhatsApp-related runs inside the Next.js server process, on the same event loop that
answers every page and API request. The ranked causes:

| # | Cause | Evidence | Effect |
|---|---|---|---|
| R1 | **Synchronous SQLite writes for every message in every chat** of the linked phone | `whatsapp-service.ts` `messages.upsert` → `authStore.saveMessage()` for *all* messages (groups, customers, status), before any filtering. `saveMessage` runs an upsert **plus** `DELETE … WHERE rowid NOT IN (SELECT … ORDER BY created_at DESC LIMIT 500)` on each call. | Every incoming message on a busy agency phone blocks all HTTP requests. Group chats make it constant. |
| R2 | **Multiple better-sqlite3 connections to one `whatsapp.db` with `busy_timeout = 5000`** | One `SqliteWhatsAppAuthStore` per `WhatsAppService` (per agency), plus extra ones in `startConfiguredWhatsAppRuntimes` and `logoutWhatsAppRuntime`. better-sqlite3 is synchronous, so a busy wait **freezes the whole thread** for up to 5 s. | Random multi-second stalls across the whole app when two agencies' sockets write keys at once. |
| R3 | Signal key reads/writes are synchronous and per-ID | `getKeys` loops one `SELECT` per id; `setKeys` runs a sync transaction; `creds.update` rewrites the full creds JSON. | Decrypting each inbound message touches the DB on the request thread. |
| R4 | PDF rendering and media encryption on the web event loop | `deliverInBackground` uses `after()`, but the work still runs in the same process: pdfkit + fonts + logo (`rental-agreement.ts`), then Baileys AES-encrypts and uploads the PDF. | CPU spikes right after every booking, checkout, check-in or payment, slowing the next requests. |
| R5 | Extra network round trips and waits per send | `send()` calls `onWhatsApp()` before every message; `sendWhatsApp*` waits up to 15 s for reconnect. | Each delivery holds resources for seconds; a disconnected socket piles them up. |
| R6 | OpenAI OCR inline in the request | `uploadBookingCnic` → `ingestBookingCnic` → `extractStoredCnicPair` awaits OpenAI; the WhatsApp CNIC command does the same inside the socket handler. | The upload request takes 5–20 s and holds a DB connection path and memory for the images. |
| R7 | Aggressive polling | WhatsApp settings polls `/api/v1/whatsapp/status` every 3 s; the booking wizard polls CNIC every 5–7 s (three intervals). Each poll resolves the session (several queries). | Constant background load per open tab. |
| R8 | Not durable, not scalable | Runtime state lives in a `globalThis` Map; deliveries are fire-and-forget; `/app/.data/whatsapp.db` is **not** on a volume in `compose.yml`. | Lost receipts on deploy or crash, QR re-scan after every redeploy, and only one web container is possible. |

R1–R3 explain most of the "it is slowing down" symptom. R4–R7 add load on top. R8 blocks scaling.

---

## 2. Goals and non-goals

**Goals**

1. The web process never runs Baileys, pdfkit or OpenAI calls. p95 API latency is unaffected by WhatsApp traffic.
2. Every customer or owner notice is **durable**: queued in the same transaction as the business write, retried with backoff, and visible with its real status.
3. Web can run N stateless replicas. WhatsApp sockets are owned by exactly one process per agency, enforced by a lease.
4. Desktop (Tauri + SQLite, single process) keeps working with the **same handler code**.
5. No new infrastructure for web: use the existing PostgreSQL.

**Non-goals (for this design)**

- Replacing Baileys with the official WhatsApp Cloud API. The design keeps a `WhatsAppTransport` interface so it can be added later (see §11).
- Real-time push to the browser (SSE / LISTEN-NOTIFY). Polling stays but becomes cheap.

---

## 3. Target architecture

One Docker image, three roles selected by `VIBERENT_ROLE`.

```
                         PostgreSQL
        ┌─────────────────────────────────────────────────────┐
        │ business tables · notification_deliveries           │
        │ whatsapp_sessions · whatsapp_auth_* · whatsapp_inbound│
        │ pgboss.* (job queue)                                │
        └───────▲──────────────────▲────────────────▲─────────┘
                │                  │                │
   ┌────────────┴───────┐ ┌────────┴─────────┐ ┌────┴───────────────────┐
   │ web  (N replicas)  │ │ worker (N)       │ │ wa-gateway (1 → shards)│
   │ Next.js            │ │ Node process     │ │ Node process           │
   │ - business writes  │ │ - render PDFs    │ │ - Baileys sockets      │
   │ - enqueue jobs     │ │ - OCR (OpenAI)   │ │ - send / receive       │
   │ - read status rows │ │ - inbound cmds   │ │ - QR + status to DB    │
   │ NO baileys/pdfkit  │ │ - cron jobs      │ │ - session leases       │
   └────────────────────┘ └────────┬─────────┘ └────────┬───────────────┘
                                   │   file store       │
                                   └── (PDFs, CNIC images, media) ──┘
```

| Role | Owns | Never does |
|---|---|---|
| `web` | HTTP, auth, domain services, enqueueing | Imports `@whiskeysockets/baileys`, `pdfkit`, `openai` at runtime |
| `worker` | CPU and slow I/O: PDF rendering, OCR, owner-command replies, recurring expenses, daily reports, cleanup | Holds WhatsApp sockets |
| `wa-gateway` | WhatsApp sockets, sending, receiving, downloading inbound media | Business logic beyond filtering and handing off |

### Queue choice: pg-boss

| Option | Verdict |
|---|---|
| **pg-boss** (Postgres) | **Chosen.** Already have Postgres; jobs can be inserted on the *same transaction client* as the business write (`db` option), giving a transactional outbox for free. Has retries with exponential backoff, `singletonKey` dedupe, cron schedules, dead-letter queues and expiration. |
| graphile-worker | Good alternative; also Postgres. Slightly less ergonomic cron and per-queue policies. Acceptable fallback. |
| BullMQ + Redis | Rejected for now: adds a second stateful service and loses the same-transaction enqueue. |
| Keep `after()` | Rejected: not durable, no retry, runs on the web event loop. |

This is one new dependency (`pg-boss`), justified under the `AGENTS.md` rule because no existing
dependency provides durable jobs.

---

## 4. Queue abstraction (works for web and desktop)

Handlers are plain functions. Only the driver differs between web and desktop.

```ts
// src/server/jobs/contracts.ts
export type JobName =
  | "notify.render"      // build the PDF/text for a delivery
  | "wa.send"            // send a prepared delivery over WhatsApp
  | "wa.inbound"         // process an inbound owner message
  | "wa.control"         // connect / disconnect / reset a session
  | "ocr.cnic"           // OCR a stored CNIC pair
  | "ocr.odometer"
  | "recurring.post"     // cron
  | "report.daily"       // cron, fans out per agency
  | "maintenance.cleanup";

export type EnqueueOptions = {
  singletonKey?: string;     // idempotency: one live job per key
  startAfterSeconds?: number;
  retryLimit?: number;
};

export interface JobQueue {
  /** Uses the current inTransaction() client when called inside one. */
  enqueue<T extends object>(name: JobName, data: T, options?: EnqueueOptions): Promise<string>;
}
```

| Driver | Used by | Implementation |
|---|---|---|
| `PgBossQueue` | web, worker, wa-gateway | pg-boss; inside `inTransaction()` it passes the active `PoolClient` from the existing `AsyncLocalStorage` store in `src/db/query.ts` so the job commits or rolls back with the business rows. |
| `LocalQueue` | desktop (SQLite) | A small `jobs` table in SQLite plus an in-process poller (every 1 s, one job at a time, same retry policy). Desktop is single-user and single-process, so this is sufficient. |

`getJobQueue()` picks the driver from `getDatabaseTarget()`, matching how `db/query.ts` already
switches between SQLite and Postgres.

Handlers live in `src/server/jobs/handlers/*.ts` and import only domain services, so the same code
runs in `worker`, `wa-gateway` and the desktop in-process runner.

---

## 5. Data model (PostgreSQL, Drizzle migrations in `drizzle-postgres/`)

### 5.1 `notification_deliveries` (new)

The source of truth for every outbound notice. Replaces "look in the audit log to see if it was sent".

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `ntf_…` |
| `agency_id` | text FK | tenant scope on every query |
| `kind` | text | `booking.agreement`, `booking.checkout_notice`, `booking.checkin_invoice`, `booking.payment_receipt`, `owner.payout_receipt`, `owner.expense_notice`, `owner.command_reply`, `report.daily` |
| `entity_type`, `entity_id` | text | booking / owner / expense |
| `channel` | text | `whatsapp` now; `email` later |
| `recipient_phone` | text | normalized at enqueue time |
| `status` | text | `queued → rendering → ready → sending → sent`; terminal: `sent`, `failed`, `skipped`, `cancelled` |
| `attempts` | int | incremented by the gateway |
| `last_error_code` | text | `whatsapp_not_connected`, `recipient_not_registered`, `render_failed`, `timeout`, … (never raw messages) |
| `document_file_id` | text FK `private_files` | rendered PDF |
| `payload` | jsonb | small inputs needed to render (e.g. receipt number) |
| `wa_message_id` | text | set when sent |
| `idempotency_key` | text | unique per agency, e.g. `booking.payment_receipt:<txnId>` |
| `requested_by` | text FK users | null for system |
| `created_at`, `updated_at`, `sent_at` | text ISO | match existing timestamp style |

Indexes: `unique(agency_id, idempotency_key)`, `(agency_id, entity_type, entity_id)`,
`(status, updated_at)` for the stuck-job sweeper.

### 5.2 `whatsapp_sessions` (new; replaces the in-memory runtime Map)

| Column | Notes |
|---|---|
| `agency_id` PK, `session_id` unique | |
| `desired_state` | `connected` / `disconnected`, set by web |
| `status` | `idle`, `connecting`, `awaiting_qr`, `connected`, `disconnected`, `logged_out`, written by gateway |
| `qr_payload`, `qr_expires_at` | raw QR string; web renders the data URL (no QR rendering in the gateway hot path) |
| `linked_jid`, `last_error_code`, `last_connected_at` | |
| `holder_id`, `lease_expires_at`, `heartbeat_at` | lease, see §7 |
| `shard` | `hash(agency_id) % WA_SHARDS`, fixed at insert |
| `updated_at` | |

`whatsapp_settings` keeps the owner phone and `listening_enabled`.

### 5.3 Auth state in Postgres (moves out of `whatsapp.db`)

- `whatsapp_auth_credentials(session_id PK, payload jsonb, updated_at)`
- `whatsapp_auth_keys(session_id, key_type, key_id, payload jsonb, updated_at, PK(session_id,key_type,key_id))`

Same shape as today's SQLite tables, so the store is a port, not a redesign.

### 5.4 `whatsapp_message_cache` (replaces `whatsapp_messages`)

Stores **only messages VibeRent sent**, which is what Baileys' `getMessage` needs for retries.
TTL 7 days, pruned by `maintenance.cleanup` hourly. Never written for inbound chats.

### 5.5 `whatsapp_inbound` (new)

`(agency_id, wa_message_id)` unique for dedupe; `kind` (`text` | `cnic_image`), `text`,
`media_file_id`, `status` (`received` → `processed` / `ignored` / `failed`), timestamps.

---

## 6. Flows

### 6.1 Outbound notice (checkout example)

```
web: POST /bookings/:id/checkout
  inTransaction:
    checkOutRental(...)                         // existing service
    insert notification_deliveries (queued, idempotency_key = booking.checkout_notice:<bookingId>)
    queue.enqueue("notify.render", {deliveryId}, {singletonKey: deliveryId})
  ← 200 { ..., notificationDelivery: { status: "queued", deliveryId } }

worker: notify.render
  load delivery; if status != queued/rendering → return (idempotent)
  status=rendering
  build PDF via existing createTransactionInvoice / createRentalAgreementPdf
  save to file store → private_files row
  status=ready, document_file_id=…
  queue.enqueue("wa.send", {deliveryId}, {singletonKey: deliveryId})

wa-gateway: wa.send
  load delivery + session; if sent → return
  if this process does not hold the agency lease → throw Retryable("not_owner")
  if socket not connected → throw Retryable("whatsapp_not_connected")
  status=sending, attempts+=1
  read PDF from file store, sock.sendMessage(...)
  status=sent, wa_message_id, sent_at; append audit event "<kind>_sent"
```

**Retry policy for `wa.send`:** `retryLimit 6`, `retryBackoff true`, `retryDelay 30` (≈30 s, 1 m, 2 m,
4 m, 8 m, 16 m). Permanent errors (`recipient_not_registered`, session `logged_out`) set `failed`
immediately and do not retry. After the final retry, the delivery becomes `failed` and an audit
event is written.

**Delivery semantics:** WhatsApp sends are not idempotent, so this is *at-least-once*. A crash
between `sendMessage` returning and the `sent` update can cause one duplicate. That window is a few
milliseconds and is accepted; it is far better than today's silent loss.

**Recipient check:** drop the `onWhatsApp()` call before every send. Cache "registered" per phone
for 24 h in memory in the gateway, and treat the send error as the authoritative signal.

**Client delivery mode:** `X-Delivery-Mode: client` keeps working: the row is inserted as
`skipped` with no job, so the history is still complete.

### 6.2 Connect, QR and status

```
web  POST /whatsapp/connect → update whatsapp_sessions set desired_state='connected'
                             → enqueue wa.control {agencyId, action:"connect"}
gateway                      → claims lease, opens socket, writes status/qr_payload rows
web  GET /whatsapp/status    → SELECT one row from whatsapp_sessions (no in-memory state)
```

Polling: 2 s only while `status in (connecting, awaiting_qr)`, otherwise 30 s, and stop when the
tab is hidden (`document.visibilityState`). Disconnect and reset work the same way through
`wa.control`.

### 6.3 Inbound owner messages and CNIC images

The gateway filters **before touching the database**:

1. `type === "notify"`, not `fromMe`, not `status@broadcast`, not a group (`@g.us`).
2. Agency has `listening_enabled` and the sender equals the owner number (cached in memory,
   refreshed when `whatsapp_settings.updated_at` changes).
3. Anything else is dropped with zero writes. **This alone removes R1.**

For a matching message the gateway:

- downloads the media if it is an image (needs the socket for `reuploadRequest`), stores it in the file store,
- inserts `whatsapp_inbound` (unique key dedupes redeliveries),
- enqueues `wa.inbound {inboundId}`.

The worker runs `runOwnerCommand` or `ingestBookingCnic` (OCR included) and replies by inserting a
`notification_deliveries` row of kind `owner.command_reply` and enqueueing `wa.send`. Replies use
the same retry path as every other notice.

### 6.4 OCR from the web upload

`uploadBookingCnic` stores the file with `ocr_status='pending'`, enqueues
`ocr.cnic {agencyId, draftId, purpose}` with `singletonKey = draftId:purpose`, and returns
immediately. The booking wizard already polls intake status, so the UI needs no new mechanism.
`ocr.cnic` concurrency is limited (e.g. 4 per worker) and rate-limited per agency to cap OpenAI cost.

### 6.5 Scheduled jobs

Moved out of `setInterval` in `instrumentation-node.ts` into pg-boss schedules (run once per
cluster, not once per replica):

| Schedule | Job | Timezone |
|---|---|---|
| hourly | `recurring.post` | Asia/Karachi |
| 12:00 daily | `report.daily` → fans out one `notify.render` per agency, key `report.daily:<agency>:<day>` | Asia/Karachi |
| hourly | `maintenance.cleanup`: prune message cache, expire booking drafts, sweep deliveries stuck in `rendering`/`sending` > 15 min back to retry | — |

The daily report is rewritten on `db/query` (today it is SQLite-only in `daily-report-scheduler.ts`),
so web agencies get it too.

---

## 7. WhatsApp gateway internals

### 7.1 Leases and ownership

- On start, and every 10 s, the gateway claims sessions for its shards that have
  `desired_state='connected'` and an expired or empty lease:
  `UPDATE whatsapp_sessions SET holder_id=$me, lease_expires_at=now()+30s WHERE agency_id IN (SELECT … FOR UPDATE SKIP LOCKED)`.
- Heartbeat every 10 s extends owned leases. If a heartbeat fails to extend a lease, the socket is
  closed immediately (same behaviour as today's SQLite lease, now in Postgres).
- On `SIGTERM`: stop fetching jobs, finish in-flight sends (max 20 s), close sockets, release
  leases. Compose sets `stop_grace_period: 30s`.

### 7.2 Routing `wa.send` to the owning process

- **Phase 1 (one gateway):** single `wa.send` queue. Trivially correct.
- **Phase 2 (sharded):** queue per shard, `wa.send.<shard>`, where `shard = whatsapp_sessions.shard`.
  Each gateway instance leases whole shards (`WA_SHARDS`, e.g. 8) and subscribes only to those
  queues. A job that lands on a non-owner retries quickly (`not_owner`, 5 s) instead of failing.

### 7.3 Event-loop hygiene inside the gateway

- Async `pg` auth store with `makeCacheableSignalKeyStore` in front (already used).
- `getKeys`: one `SELECT … WHERE key_id = ANY($ids)` instead of one query per id.
- `setKeys`: single multi-row upsert per call.
- `creds.update`: debounce writes by 1 s, always flush on shutdown and on `connection.update`.
- No per-message prune; cleanup is a scheduled job.
- Baileys logger at `warn` in production (pino `info` is noisy at volume).

### 7.4 Capacity

Size it by measuring per-socket RSS on the staging box after the R1 fix. Start with a soft cap such as `WA_MAX_SESSIONS_PER_PROCESS=50` and alert above 80 % of the container memory limit. Add shards before the cap is reached.

---

## 8. Code layout

```
src/server/jobs/
  contracts.ts            JobName, payload types, JobQueue interface
  queue.ts                getJobQueue(): PgBossQueue | LocalQueue
  pg-boss-queue.ts
  local-queue.ts          SQLite jobs table + poller (desktop)
  retry.ts                RetryableError / PermanentError classification
  handlers/
    notify-render.ts
    wa-send.ts
    wa-inbound.ts
    wa-control.ts
    ocr-cnic.ts
    recurring-post.ts
    report-daily.ts
    maintenance-cleanup.ts
src/server/whatsapp/
  transport.ts            WhatsAppTransport interface (send, status, events)
  baileys-transport.ts    today's WhatsAppService, minus SQLite and message store
  postgres-auth-store.ts  port of sqlite-auth-store.ts
  gateway.ts              lease loop, socket registry, inbound filter
src/server/services/
  notification-service.ts enqueue helpers used by domain services (replaces deliverInBackground)
src/roles/
  worker.ts               boots pg-boss, registers handlers, health on :3001
  wa-gateway.ts           boots gateway + wa.* handlers, health on :3002
```

`src/server/api/delivery.ts` (`deliverInBackground` with `after()`) is removed. Route handlers and
Server Actions call `notification-service` inside the existing mutation transaction.

**Build:** worker and gateway entrypoints are bundled with esbuild (already present via `tsx`) into
`dist/roles/*.js`, with `--conditions=react-server` so `server-only` imports resolve, as the
existing `db:check` scripts already do. New scripts: `build:roles`, `start:worker`, `start:wa-gateway`.

**Desktop:** `instrumentation-node.ts` starts the `LocalQueue` runner and the gateway in-process
when `VIBERENT_DESKTOP=1`. No behaviour change for desktop users except that deliveries now survive
an app restart.

---

## 9. Deployment (compose)

```yaml
services:
  web:
    environment: { VIBERENT_ROLE: web }
  worker:
    image: viberent-web:latest
    command: ["node", "dist/roles/worker.js"]
    environment: { VIBERENT_ROLE: worker }
    volumes: [private_files:/app/.data/private-files]
  wa-gateway:
    image: viberent-web:latest
    command: ["node", "dist/roles/wa-gateway.js"]
    environment: { VIBERENT_ROLE: wa-gateway, WA_SHARDS: "8" }
    stop_grace_period: 30s
    volumes: [private_files:/app/.data/private-files]
```

The shared `private_files` volume is a stop-gap. Once the file store moves to S3-compatible
object storage, no service needs a volume except Postgres.

Postgres connections: web `POSTGRES_POOL_MAX=10` × replicas, worker 10, gateway 5, pg-boss
uses its own small pool (set `max: 4`). Put PgBouncer (transaction mode) in front before
going beyond ~3 web replicas.

---

## 10. Rollout plan

Each phase is shippable alone and measurably faster than the one before.

### Phase 0: stop the bleeding (1–2 days, no new architecture)

1. In `whatsapp-service.ts`, filter inbound messages **before** `saveMessage`: skip groups,
   broadcasts and non-owner senders; only cache messages VibeRent sent.
2. Remove the per-insert prune from `saveMessage`; prune on an hourly timer.
3. Share **one** `SqliteWhatsAppAuthStore` connection per process instead of one per agency.
4. Batch `getKeys` into one query; drop the pre-send `onWhatsApp()` check (cache it instead).
5. Mount the whole `/app/.data` directory as a volume in `compose.yml`.
6. Status polling: 2 s only while awaiting QR, 30 s otherwise, pause when the tab is hidden.

*Exit criteria:* p95 of `/api/v1/dashboard` unchanged while the linked phone receives a burst of
group messages; event-loop lag (`perf_hooks.monitorEventLoopDelay`) p99 under 50 ms.

### Phase 1: durable deliveries and the worker (≈1 week)

1. Add `pg-boss`, the `JobQueue` abstraction, and `notification_deliveries`.
2. Replace every `deliverInBackground` call with an in-transaction enqueue.
3. Worker role: `notify.render`, `ocr.cnic`, `recurring.post`, `report.daily`, `maintenance.cleanup`.
4. For this phase `wa.send` runs in the web process's in-process consumer (sockets have not moved
   yet), but PDF rendering and OCR are already off the web event loop.
5. UI: show delivery status per booking with a "Retry" action for `failed` (owner/manager only).

*Exit criteria:* kill the web container mid-checkout and confirm the receipt is still delivered
after restart; no `after()` calls remain.

### Phase 2: WhatsApp gateway (≈1 week)

1. Port the auth store to Postgres; one-time migration script that copies
   `whatsapp.db` credentials and keys so agencies do **not** need to re-scan the QR.
2. `whatsapp_sessions` replaces the in-memory Map; status endpoint reads the row.
3. Gateway role owns sockets, `wa.send`, `wa.control` and the inbound filter.
4. Web stops importing Baileys; remove it from `serverExternalPackages` for the web build target.

*Exit criteria:* run 2 web replicas behind the proxy; connect, QR, send, inbound CNIC and
disconnect all work; redeploying web never drops the WhatsApp connection.

### Phase 3: shard when needed

Turn on `WA_SHARDS` routing (§7.2) when a single gateway approaches its session cap.

---

## 11. Risks and decisions

| Risk / decision | Mitigation |
|---|---|
| Baileys is unofficial; numbers can be restricted for bulk or automated sending | Keep sends 1:1 and transactional (no broadcast). `WhatsAppTransport` interface allows adding the official WhatsApp Cloud API per agency later. Rate-limit sends per agency (e.g. 20/min) in the gateway. |
| Duplicate message after a crash mid-send | Accepted (§6.1). Rare and visible in the delivery history. |
| Gateway is a single point of failure in Phase 2 | Deliveries queue up and retry for ~30 min; status shows "WhatsApp offline". Restart policy `unless-stopped`; lease lets a replacement take over within 30 s. |
| Two gateways hold one session during a rolling deploy | Postgres lease plus "close on lost heartbeat". Use Recreate deploys for the gateway. |
| Desktop divergence | Same handlers, only the queue driver differs; `LocalQueue` gets its own tests. |
| OpenAI cost abuse via OCR | Per-agency rate limit and concurrency cap on `ocr.cnic`. |

---

## 12. Test plan

- **Unit:** each handler with a fake transport and fake queue (idempotency: running a handler twice
  sends once when status is already `sent`).
- **Integration (Postgres in Docker):** enqueue inside `inTransaction()` and roll back, so no job exists;
  commit, so the job exists; retry classification; cron fires once with two worker replicas.
- **Gateway:** lease takeover after `kill -9`; inbound filter writes nothing for group messages;
  auth-state migration from SQLite keeps the session paired.
- **Load:** replay 1,000 inbound group messages and measure event-loop lag and API p95 before and after Phase 0.
- **Desktop:** `LocalQueue` delivers after an app restart; `npm run db:check:desktop-upgrade` still passes.

---

## 13. Open questions

1. Should owner-command replies and daily reports stay on WhatsApp, or also go to email (Resend is already a dependency)?
2. Is per-agency rate limiting of WhatsApp sends acceptable (e.g. 20 messages/min)?
3. When does object storage (S3/R2) land? The worker and gateway need shared file access until then.
