# VibeRent Mobile Application PRD

**Status:** Proposed for approval

**Date:** 17 October 2026

**Platforms:** Android first, iOS compatible

**Frontend:** Flutter

**Backend:** Existing VibeRent Next.js modular monolith through versioned HTTPS APIs

**Market defaults:** Pakistan, PKR, `Asia/Karachi`, English first with Urdu/RTL readiness

## 1. Executive summary

VibeRent Mobile is a field-operations companion for rental-agency staff. It is not a smaller copy of the web dashboard. Its first job is to let rental agents and fleet managers complete time-sensitive work away from a desk: see today's pickups and returns, find a vehicle, create or open a booking, register a customer, check a vehicle out, check it back in, capture condition evidence, and submit an expense.

The Flutter application is a client of the existing VibeRent backend. It must never connect to SQLite directly or duplicate pricing, availability, authorization, booking-state, or financial rules. Both web and mobile call the same application services through `/api/v1`.

The recommended first release is online-first with a read-only local cache. High-risk writes—booking confirmation, checkout, check-in, payment, refund, and payout—only succeed after the server confirms them. Offline mutation queues are deliberately excluded from MVP because silent conflict resolution is unsafe for vehicle availability and money.

## 2. Product decision

### 2.1 What we are building

A staff-only mobile application for:

- Agency owners who need operational visibility.
- Fleet managers coordinating vehicles and handovers.
- Rental agents creating bookings and completing pickups/returns.
- Accountants submitting or reviewing expenses where permitted.

### 2.2 What we are not building in MVP

- A customer booking application.
- A managed-owner self-service portal.
- A complete mobile replacement for web administration.
- Database access from the device.
- Offline booking, payment, checkout, or check-in writes.
- Settings, user/role management, backups, desktop licensing, or bulk administration.
- Full reports, owner statements, or payouts.
- Live GPS tracking, telematics, or background location.
- In-app payment-gateway collection.
- Legally certified e-signature.

### 2.3 Product positioning

| Surface | Primary purpose | Canonical capabilities |
| --- | --- | --- |
| Web/desktop | Administration and full operations | Fleet setup, configuration, reports, owners, users, backups, complete record management |
| Mobile | Counter and field execution | Today's work, search, booking, customer intake, handover, return, evidence, expense |
| Next.js backend | System of record and business rules | Identity context, authorization, services, transactions, audit, SQLite repositories, files |

## 3. Goals and success measures

### 3.1 Goals

1. Make today's pickups, returns, delays, and blocked actions clear within five seconds of launch.
2. Let an authorized agent create a valid booking in under three minutes.
3. Let an agent complete a standard checkout or check-in in under five minutes, excluding customer discussion.
4. Capture consistent odometer, fuel, condition, and photo evidence at handover.
5. Preserve tenant, role, and branch boundaries exactly as the web application does.
6. Remain dependable on variable Pakistani mobile networks without pretending an unconfirmed write succeeded.
7. Reuse the same API and server-side business logic as the web product.

### 3.2 MVP success metrics

| Metric | Target |
| --- | --- |
| Crash-free sessions | At least 99.5% during pilot |
| API-confirmed checkout/check-in completion | At least 98% without support intervention |
| Median booking creation time | Under 3 minutes |
| Median standard handover time | Under 5 minutes |
| Duplicate write rate | 0 for idempotent operations |
| Cross-agency or unauthorized data exposure | 0 |
| Confirmed overlapping bookings created by mobile | 0 |
| Core task completion at 360 px logical width | 100% |
| Accessibility-label coverage for interactive controls | 100% |

Pilot metrics must not include CNIC, phone, token, document contents, or other sensitive payloads.

## 4. Assumptions and release gates

### 4.1 Assumptions

- The existing Next.js application remains the only backend implementation.
- SQLite with Drizzle remains the pilot database.
- Only one backend application instance writes to the SQLite file.
- The first pilot is staff-only and invitation-controlled.
- Whole PKR integers remain the current money representation until the backend contract explicitly changes.
- Server timestamps are ISO 8601; presentation uses `Asia/Karachi` unless the agency later configures another zone.
- Android is the operational priority, but architecture and components must compile and behave correctly on iOS.

### 4.2 Blocking gates before external pilot

1. **Deployment gate:** The API must be reachable through a stable HTTPS origin. The current Windows desktop/local backend is only suitable for phones on the same trusted network. Remote use requires a hosted, single-instance Node.js deployment with persistent storage and backups, or an approved database migration.
2. **Native authentication gate:** Secure cookie sessions are implemented for web. Mobile needs a reviewed bearer-token/native-session contract with short-lived access, refresh rotation, revocation, and device-session visibility.
3. **File gate:** Mobile photos and receipts need authorized private upload/download behavior. Local desktop file paths cannot be exposed to phones.
4. **Contract gate:** The mobile subset of `/api/v1` needs an OpenAPI contract, stable DTOs, pagination, idempotency, and contract tests.
5. **Rate-limit gate:** Login, lookups, uploads, and mutations need deployment-appropriate rate limits.
6. **Operations gate:** Error tracking, safe structured logs, health checks, restore testing, and disk-capacity monitoring must be active.

## 5. Users, permissions, and branch scope

The server is authoritative. The app may hide unavailable actions for usability, but every request is independently authorized by the backend.

| Capability | Agency owner | Fleet manager | Rental agent | Accountant |
| --- | ---: | ---: | ---: | ---: |
| View today's operations | Yes | Yes | Assigned/branch | Branch as needed |
| Search/view vehicles | Yes | Yes | Branch | Read-only as needed |
| Create customer | Yes | Yes | Yes | Usually read-only |
| Create booking | Yes | Yes | Yes | No by default |
| Check out/check in | Yes | Yes | Yes | No by default |
| Upload condition evidence | Yes | Yes | Yes | No by default |
| Submit expense | Yes | Yes | Yes if policy allows | Yes |
| Approve expense | Yes | Permission-based | No | Permission-based |
| Record payment | Permission-based | Permission-based | Permission-based | Yes |
| Mobile reports/admin | Later | Later | No | Later |

Actual permissions come from the backend permission map and branch assignments. The Flutter app must not maintain a separate hard-coded authorization truth; it consumes capabilities returned by session/resource DTOs.

## 6. MVP information architecture

### 6.1 Primary navigation

Use a four-destination bottom navigation bar:

1. **Today** — pickups, returns, exceptions, and quick actions.
2. **Bookings** — searchable and filterable booking list.
3. **Fleet** — vehicle search, status, and availability.
4. **More** — customers, expenses, activity, profile, help, and sign out.

Why: these destinations map to frequent field tasks and fit one-handed mobile use. Customers and expenses remain accessible without consuming permanent navigation space. Reports, owners, settings, backups, licensing, and staff management remain web-first.

### 6.2 Deep-link routes

```text
/today
/bookings
/bookings/new
/bookings/:bookingId
/bookings/:bookingId/checkout
/bookings/:bookingId/checkin
/fleet
/fleet/:vehicleId
/customers
/customers/new
/customers/:customerId
/expenses/new
/activity
/profile
```

All record screens must be addressable by route, restore correctly after process death when safe, and route unauthenticated users through sign-in before returning to the intended destination.

## 7. Screen requirements

### M-01 — Launch and session restoration (`P0`)

- Show branded launch state while secure credentials and cached session metadata are checked.
- Refresh the access session before loading protected data when required.
- Route to sign-in, agency selection, or Today.
- Never flash protected cached data after logout or tenant change.
- On forced logout, explain whether the session expired, was revoked, or the account lost access.

### M-02 — Sign in and recovery (`P0`)

- Email and password sign-in using a native-safe backend contract.
- Forgot-password flow opens the approved web/system-browser recovery experience or a dedicated mobile flow.
- Clear field errors without revealing whether an unrelated account exists.
- Support password-manager autofill.
- Optional biometric app unlock may be added after a valid server session exists; biometrics never replace server authentication.
- Public agency creation and invitation administration stay on web for MVP.

### M-03 — Agency and branch context (`P0`)

- If a user belongs to multiple agencies, require an active agency selection.
- Show the active agency in Profile and on context-switch UI.
- Respect returned branch scope; users with one branch receive it automatically.
- Switching agency clears tenant-specific memory and disk caches before loading the new tenant.
- Branch selection never sends an arbitrary branch the user is not allowed to access.

### M-04 — Today (`P0`)

- Show current Pakistan-local date and last successful refresh time.
- Sections: due next, pickups, returns, overdue, and recently completed.
- Each task card shows event type, time, vehicle/plate, customer, location, status, and blocking warnings.
- Quick actions: New booking, Find vehicle, Add customer, Add expense, permission-aware.
- Pull to refresh; preserve existing data with a non-blocking refresh indicator.
- Cached data is labeled "Last updated …" when offline.
- An overdue return or failed readiness check cannot be represented only by color.

### M-05 — Booking list (`P0`)

- Search booking number, customer, phone, plate, make/model.
- Filters: status, date, city/branch, payment state, assigned agent where authorized.
- Mobile cards prioritize booking number, vehicle, customer, interval, balance, and status.
- Cursor pagination/infinite loading with explicit retry row on failure.
- Filter state survives navigation within the session.
- Empty, filtered-empty, loading, stale-cache, and error states are distinct.

### M-06 — New booking (`P0`)

Use a five-step, resumable-in-session flow:

1. Branch/city, pickup and return date/time.
2. Available vehicle.
3. Existing or new customer.
4. Server-priced summary, discount/deposit/extras permitted by policy.
5. Review and confirm.

Rules:

- Validate obvious fields locally for immediate feedback.
- Request availability from the server; never infer it from vehicle status alone.
- Display why a vehicle is unavailable when the API provides a reason.
- The server calculates or verifies price and rechecks availability in its transaction.
- Confirmation uses an idempotency key generated once per submit intent.
- A network timeout after submit enters "Checking result" rather than allowing an immediate duplicate submission.
- A `BOOKING_CONFLICT` returns the user to vehicle selection with their other inputs preserved.
- Draft data may remain in memory during the flow, but MVP does not create an offline blocking booking.

### M-07 — Booking detail and next action (`P0`)

- Booking number and status.
- Customer and vehicle summary with tap-through links.
- Schedule, pickup/return locations, pricing lines, paid/deposit/balance summary, and notes.
- Readiness blockers: identity/license, deposit/payment, vehicle status, documents, or permissions.
- One prominent state-aware action: Confirm, Check out, Check in, or Review completed rental.
- Secondary actions only when supported by API and role.
- Activity/inspection history.
- Destructive or financial changes require confirmation and, where policy requires, a reason.

### M-08 — Checkout/handover (`P0`)

Steps:

1. Readiness review and customer identity/license confirmation.
2. Actual handover time, odometer, fuel level.
3. Condition checklist by vehicle area.
4. Guided photos and notes.
5. Accessories/fuel/keys confirmation.
6. Review and server-confirmed checkout.

Requirements:

- Numeric odometer validation and comparison against prior value.
- Fuel uses an accessible labeled scale, not color alone.
- Photo slots identify front, rear, left, right, interior, odometer, fuel, and additional damage.
- Compress large images on device while retaining enough detail for evidence; preserve orientation; strip unnecessary location metadata.
- Upload progress is visible per file and recoverable before final submission.
- Final checkout is atomic on the server with booking transition, inspection, vehicle state, and audit event.
- Do not show success until the server returns the updated booking.

### M-09 — Check-in/return (`P0`)

- Present checkout baseline beside current return inputs.
- Capture actual time, odometer, fuel, condition, photos, accessories, and notes.
- Highlight new damage, lower fuel, excess distance, or lateness.
- Server calculates authoritative charges; app displays line items before confirmation.
- Waiving a charge requires permission and a reason.
- Deposit handling and payment posting are shown only when corresponding backend contracts are production-ready.
- Final check-in is atomic and auditable.
- If vehicle disposition is maintenance/out-of-service, capture the reason and show the resulting status.

### M-10 — Fleet list and availability (`P0`)

- Search plate, make, and model.
- Filter status, branch/city, ownership, and category.
- Vehicle card: photo placeholder, make/model/year, plate, branch/city, ownership, status, and rate.
- Availability search requires an interval and optional location/category.
- Cached fleet data may be browsed offline but is clearly stale and cannot authorize a booking.

### M-11 — Vehicle detail (`P0` read, `P1` edit)

- Overview, current status/location, odometer, ownership, rate, document/maintenance warnings, upcoming booking.
- Quick action to start a booking with the vehicle preselected.
- P1: permitted status transition, maintenance block, or selected field edits.
- Full vehicle creation, document administration, agreements, and archival remain web-first for MVP.

### M-12 — Customer search, detail, and creation (`P0`)

- Search name, phone, and permitted masked identity fields.
- Customer detail: contact, masked CNIC, license status/expiry, warning/blacklist state, and recent bookings.
- Creation: name, father name where used, phone, optional email/address, CNIC, license number and expiries.
- Normalize phone/CNIC server-side and return duplicate candidates before creating a new record.
- Never persist unmasked CNIC in analytics, logs, or general-purpose local preferences.
- Allow an authorized user to capture the customer's ID card/CNIC front and back with the mobile camera.
- Use a guided two-step flow: **Front side** then **Back side**, with a card-shaped framing overlay, orientation guidance, flash control, and a clear side label.
- After each capture, show a full preview with **Retake** and **Use photo** actions. Do not advance until the user accepts the image.
- Require both sides when the agency policy makes identity images mandatory; otherwise allow an explicit authorized skip with a reason.
- Run client-side quality hints for blur, glare, darkness, cutoff edges, and unreadable framing. These are capture aids, not identity verification.
- Correct orientation, crop only with user-visible bounds, compress off the UI isolate, and remove unnecessary location metadata before upload.
- Keep captured files in app-private temporary storage only until upload or cancellation. Delete local temporary files after successful upload, sign-out, agency switch, or draft expiry.
- Upload the two sides as separately classified private files (`cnic_front` and `cnic_back`) tied to the customer or booking intake record.
- Show independent upload progress and retry for each side. Customer/booking completion must not claim the ID is stored until both required uploads are confirmed by the server.
- Gallery import may be offered as a policy-controlled fallback, but the default action is camera capture.
- OCR is optional and remains a later enhancement. OCR output must be reviewed by the user and must never silently overwrite entered identity data.

### M-13 — Expense capture (`P0`)

- Amount, category, date, description, and optional vehicle/booking/customer/owner links.
- Receipt photo/file with progress and retry.
- Submission status reflects backend workflow: submitted, approved, rejected, or draft if supported.
- Amount uses whole PKR under the current API contract.
- A submitted expense is not silently overwritten; later corrections follow backend audit rules.

### M-14 — Activity and notifications (`P1`)

- Cursor-paginated activity feed with entity links.
- In-app attention center for pickup/return changes, overdue work, upload failures, and conflicts.
- Push notifications are a separate implementation decision; no Firebase/APNs dependency is required for MVP unless approved.
- Notification payloads must contain opaque record IDs and non-sensitive summaries only.

### M-15 — Profile, diagnostics, and sign out (`P0`)

- Name, role, agency, authorized branches, app version, environment, privacy/help links.
- Connection diagnostic: API reachable, last sync time, and request ID for the last failure.
- Sign out revokes or invalidates the device session where supported, clears access/refresh tokens, clears tenant caches, and returns to sign-in.
- Provide no mobile controls for desktop backups, licenses, or Google Drive recovery.

## 8. Shared Flutter UI components

Build these before feature screens so mobile behavior stays consistent.

| Component | Responsibility | Why it is shared |
| --- | --- | --- |
| `VibeRentAppShell` | Bottom navigation, safe areas, route container | Keeps primary navigation and system-inset behavior consistent |
| `AppTopBar` | Title, back, context, actions | Prevents screen-specific header drift |
| `PageScaffold` | Loading/error/body/footer layout | Standardizes edge-to-edge spacing and keyboard behavior |
| `PrimaryButton`, `SecondaryButton`, `DangerButton` | Enabled/loading/disabled semantics | Ensures touch target, progress, and destructive treatment consistency |
| `AsyncContent<T>` | Initial loading, refresh, error, data, empty | Every API screen needs the same honest state model |
| `ErrorState` | Friendly error, request ID, retry | Makes support and recovery predictable |
| `EmptyState` and `FilteredEmptyState` | No records vs no matches | Prevents confusing a filter result with missing data |
| `OfflineBanner` / `StaleDataBanner` | Connectivity and cache age | Stops cached operational data looking live |
| `StatusBadge` | Text + icon + semantic color for all statuses | Central source of status meaning and accessibility |
| `RecordCard` | Responsive list-row/card base | Mobile replacement for web tables |
| `SearchField` | Debounced query, clear, accessible label | Shared search behavior across bookings, fleet, customers |
| `FilterSheet` and `ActiveFilterChips` | Full-height/bottom-sheet filters | Better mobile usability than dense dropdown rows |
| `MoneyText` | PKR formatting and negative/positive semantics | Eliminates inconsistent money display |
| `LocalDateText` / `LocalDateTimeText` | API time conversion | Prevents timezone mistakes |
| `SectionCard` | Titled grouped content | Recreates VibeRent hierarchy without generic dashboard clutter |
| `KeyValueRow` | Label/value record facts | Consistent detail screens and screen-reader order |
| `FormTextField`, `FormMoneyField`, `FormPhoneField`, `FormCnicField` | Labels, validation, formatters | Sensitive/local formats require one tested implementation |
| `FormSelectField` | Async/static choice with retry | Handles branches, categories, vehicles, and customers consistently |
| `DateTimeField` | Local display with timezone-safe ISO output | Avoids repeated date conversion bugs |
| `FuelLevelField` | Discrete accessible fuel input | Makes fuel capture quick and unambiguous |
| `OdometerField` | Numeric input with baseline comparison | Prevents impossible or regressive readings |
| `ConditionChecklist` | Area/status/notes collection | Shared by checkout and check-in |
| `IdentityCardCapture` | Guided front/back capture, framing overlay, review, retake, quality hints, and upload state | Prevents inconsistent handling of sensitive identity images across customer and booking flows |
| `EvidencePhotoGrid` | Required slots, add/replace/delete/progress | Makes evidence completeness visible |
| `UploadTile` | Local preview, compressing/uploading/failed/done | Gives per-file recovery rather than one opaque spinner |
| `ConfirmationSheet` | Review, warning, optional reason | Used for high-risk status and financial actions |
| `ConflictSheet` | Version/booking conflict explanation and recovery | Prevents last-write-wins behavior |
| `PermissionBoundary` | Hides or explains unavailable actions using server capabilities | Improves UX without pretending to be security |
| `RequestInFlightGuard` | Prevents duplicate submits | Required alongside backend idempotency |
| `SensitiveValue` | Mask/reveal with authorization and timeout | Centralizes CNIC/license privacy behavior |

### 8.1 Design tokens

- Primary: `#006FE6`.
- Main text: `#19191F`.
- App canvas: `#F8FAFC`.
- Card surface: white.
- Radius: 12 px for cards and primary fields.
- Minimum touch target: 48 x 48 logical pixels.
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Use semantic success/warning/error/info colors with a label and/or icon.
- Support text scaling without clipping at least through the platform's common accessibility settings.
- Respect reduced-motion settings and avoid motion required to understand state.
- Dark mode is `P2`; do not ship a partially themed version.

## 9. Flutter architecture and package decisions

Exact package versions must be selected and locked when the Flutter project is bootstrapped. Upgrade guides and platform requirements must be reviewed at that time.

### 9.1 Architecture

Use feature-first MVVM with repositories and services:

```text
Widgets / Views
      |
View models (Riverpod Notifiers, immutable UI state)
      |
Optional use cases for multi-repository workflows
      |
Repositories (single source of truth, cache/retry mapping)
      |
API service | secure token store | read cache | platform media
```

This follows Flutter's current architecture guidance: separate views, view models, repositories, and services; add use cases only where a workflow genuinely coordinates multiple repositories. Server-owned business rules stay on the server.

### 9.2 Recommended components

| Concern | Choice | Why this choice | Do not choose now |
| --- | --- | --- | --- |
| UI framework | Flutter stable + Material 3 | One Android/iOS codebase, strong native interaction and accessibility foundation | Separate native apps; Flutter web as a replacement for the existing web dashboard |
| State + DI | `flutter_riverpod` using `Notifier`/`AsyncNotifier` | Clear async loading/error states, testable dependency overrides, scoped session state | Combining Riverpod, Bloc, GetX, and service locators |
| Navigation | `go_router`, preferably typed routes | Deep links, redirects, nested shell navigation, restoration-friendly URL model; maintained by flutter.dev | Hand-written string route switches for a growing app |
| HTTP | `dio` behind one `ApiClient` | Interceptors, cancellation, timeouts, multipart upload, progress, and centralized error mapping | Calling Dio directly from widgets |
| Models | `freezed` + `json_serializable` | Immutable DTO/domain/UI states, `copyWith`, reliable JSON generation, union states | Hand-written map parsing across features |
| Secure secrets | `flutter_secure_storage` | Uses platform secure storage for refresh/access secrets | `shared_preferences`, Drift, logs, or source constants for tokens |
| Read cache | Drift, introduced with cached MVP screens | Typed SQLite cache, migrations, queries, and a credible future sync boundary | Direct reuse/copy of the backend SQLite file; offline write queue in MVP |
| Simple preferences | `shared_preferences` only for non-sensitive UI choices | Appropriate for filter hints, onboarding flags, theme choice later | Identity, CNIC, tokens, permissions, authoritative records |
| Localization | Flutter `gen_l10n` + `intl` | First-party localization flow and PKR/date formatting; keeps Urdu/RTL path open | Hard-coded display strings throughout widgets |
| Camera | Flutter-maintained `camera` plugin for guided ID-card front/back capture | Provides an in-app live preview needed for a card frame, side instructions, flash, and immediate review | Launching an uncontrolled external camera for required identity capture |
| Photo picker | `image_picker` only for policy-approved gallery fallback and simple evidence capture | Uses platform selection flows without broad filesystem access | Treating gallery import as the default for identity capture |
| Files | Platform document picker only when PDF receipts/documents enter scope | Avoids broad storage permissions for photo-only MVP | General filesystem browsing by default |
| Image processing | Isolate-backed compression utility behind `MediaProcessor` | Controls upload size without freezing UI; implementation can change | Encoding large images on the UI isolate |
| Logging | App-owned redacting logger interface | Guarantees sensitive-field filtering and keeps vendor choice replaceable | Raw `print` statements or request/response body logging |
| Crash reporting | Provider adapter selected before pilot | Required operationally, but privacy/hosting decision is still open | Coupling features directly to one SDK before approval |
| Analytics | Typed product-event interface, no-op until approved | Lets product metrics be added without leaking sensitive data | Session replay on CNIC, payment, photo, or document screens |
| Testing | `flutter_test`, `integration_test`, fakes/provider overrides; screenshot/golden tests for primitives | First-party base plus deterministic architecture tests | Tests that depend on the live production backend |

References: [Flutter app architecture](https://docs.flutter.dev/app-architecture), [Flutter navigation](https://docs.flutter.dev/ui/navigation), [Flutter camera guidance](https://docs.flutter.dev/cookbook/plugins/picture-using-camera), [Riverpod](https://pub.dev/packages/flutter_riverpod), [go_router](https://pub.dev/packages/go_router), [Dio](https://pub.dev/packages/dio), [Freezed](https://pub.dev/packages/freezed), [Flutter secure storage](https://pub.dev/packages/flutter_secure_storage), and [Drift](https://pub.dev/documentation/drift/latest/).

### 9.3 Why Riverpod instead of Bloc or Provider

- VibeRent has many independent async resources and mutation states.
- Provider overrides make repository/service fakes straightforward in tests.
- `AsyncNotifier` can represent initial load, refresh, mutation, and invalidation without embedding network logic in widgets.
- Riverpod also supplies dependency injection, so a second DI framework is unnecessary.

Bloc is a valid alternative for a team already standardized on it. Switching is justified only before feature development or through an explicit architecture decision—not feature by feature.

### 9.4 Why Drift if MVP is online-first

Drift stores a bounded, tenant-partitioned read cache for Today, recent bookings, fleet summaries, and reference catalogs. It does not become an offline system of record. A typed database offers explicit migrations, expiry, tenant purge, and later cursor-sync support, which are harder to enforce with an unstructured key-value cache.

Do not add Drift in the first vertical slice unless cached reads are part of that slice's acceptance criteria. Repository interfaces must allow it to be added without changing views.

## 10. Proposed Flutter project structure

```text
mobile/
  android/
  ios/
  lib/
    app/
      app.dart
      bootstrap.dart
      router.dart
      theme/
      localization/
    core/
      api/
        api_client.dart
        api_envelope.dart
        api_error.dart
        auth_interceptor.dart
      auth/
      cache/
      config/
      logging/
      media/
      security/
      time/
      widgets/
    features/
      session/
        data/
        domain/
        presentation/
      today/
      bookings/
      fleet/
      customers/
      rental_operations/
      expenses/
      activity/
      profile/
    main_dev.dart
    main_staging.dart
    main_production.dart
  test/
  integration_test/
```

Rules:

- Widgets never call HTTP, secure storage, or Drift directly.
- API DTOs are not reused as editable form state.
- Repositories map API errors into typed application failures.
- View models own screen state and commands; views own layout and animation only.
- Use cases are added for real cross-repository workflows, not as one-line wrappers.
- One `ApiClient` owns base URL, headers, timeouts, request IDs, and envelope decoding.
- Generated files are committed or regenerated consistently according to the team's chosen workflow.

## 11. Backend architecture for mobile

```text
Flutter app
  | HTTPS + JSON/multipart
  | Authorization: Bearer <short-lived-access-token>
  v
Next.js /api/v1 Route Handlers
  | authenticate + validate + authorize + map DTO
  v
Existing application/domain services
  | tenancy + availability + pricing + transitions + transactions + audit
  v
Repositories -> Drizzle -> SQLite (one writable backend instance)
  |
Private object storage / authorized file streaming
```

The mobile app must never call Server Actions, read web cookies as its long-term native contract, or invoke database-specific endpoints.

### 11.1 Deployment modes

| Mode | Use | Constraint |
| --- | --- | --- |
| Same-LAN companion | Controlled on-premise pilot | Phone and Windows host share trusted network; discovery and TLS/onboarding require design; no remote access guarantee |
| Hosted single instance | Recommended mobile pilot | Long-running Node.js process, persistent disk, HTTPS, backups, one SQLite writer |
| Horizontally scaled hosted service | Later | Requires PostgreSQL reassessment before multiple writers |

For a public app-store release, use a stable hosted HTTPS API. Do not expose a desktop machine or raw local port directly to the public internet.

## 12. Native authentication decision

### 12.1 Required behavior

- Short-lived bearer access token.
- Rotating refresh token with reuse detection or equivalent server-side revocation protection.
- Refresh token stored only in platform keychain/keystore.
- Device/session record with created time, last used time, device label, and revoke action.
- Server derives user, agency, membership, role, and branch scope; none are trusted from token claims without validation.
- Logout revokes the refresh/device session and deletes local secrets.
- Password reset or staff deactivation revokes applicable mobile sessions.
- Concurrent refresh attempts are serialized on device.

### 12.2 Recommended implementation path

Keep Better Auth as the identity and organization system, but complete a short authentication spike before Flutter feature work:

1. Evaluate Better Auth's current OAuth 2.1/native or bearer capabilities against the requirements above.
2. Prefer a standards-based Authorization Code + PKCE flow in the system browser if it satisfies email/password, invitations, refresh rotation, revocation, and mobile UX.
3. If using Better Auth's bearer plugin, do not ship it merely because it can authenticate an `Authorization` header; its lifecycle must meet the short-lived/rotation/revocation requirements and its current maturity must pass security review.
4. If Better Auth cannot meet the requirements cleanly, place a reviewed mobile-session adapter beside it or approve an identity-provider change through an ADR. Do not implement ad-hoc password cryptography in Flutter or Route Handlers.

Better Auth currently documents bearer authentication, but the documentation marks the feature beta and advises caution. That makes it suitable for a spike, not an automatic production decision: [Better Auth bearer documentation](https://better-auth.com/docs/beta/plugins/bearer).

## 13. API contract and gap analysis

### 13.1 Existing endpoints usable as a base

| Capability | Current route | Mobile action |
| --- | --- | --- |
| Session | `GET /api/v1/session` | Keep; add explicit capability and device-session data as needed |
| Today | `GET /api/v1/operations/today?date=YYYY-MM-DD` | Keep; document timezone and cache validators |
| Fleet | `GET /api/v1/vehicles` | Add documented filters/pagination if missing |
| Vehicle detail | `GET /api/v1/vehicles/:id` | Keep DTO stable and branch-scoped |
| Availability | `GET /api/v1/vehicles/availability` | Keep; add location/category filters and unavailable reasons where needed |
| Bookings | `GET /api/v1/bookings` | Add search/filter/cursor contract if missing |
| Create booking | `POST /api/v1/bookings` | Add mandatory idempotency contract and timeout recovery lookup |
| Booking detail | `GET /api/v1/bookings/:id` | Keep; include actions/capabilities/readiness |
| Checkout | `POST /api/v1/bookings/:id/checkout` | Keep; define uploaded file references and idempotency |
| Check-in | `POST /api/v1/bookings/:id/checkin` | Keep; define charge preview/finalization contract |
| Customers | `GET\|POST /api/v1/customers` | Add duplicate-candidate response and documented search behavior |
| Customer detail | `GET /api/v1/customers/:id` | Keep masked identity behavior |
| Customer ID images | Not yet available as a mobile-safe contract | Add authorized front/back upload, status, replace, and delete behavior backed by private storage |
| Expenses | `GET\|POST /api/v1/expenses` | Define receipt reference and submit status |
| Activity | `GET /api/v1/activity?before=...&limit=...` | Keep cursor pagination |
| Files | `GET\|POST /api/v1/files` and `GET /api/v1/files/:id` | Replace/extend local-only assumptions for hosted private storage |
| Payments | `POST /api/v1/bookings/:id/payments` | Exclude until mobile finance permissions/idempotency are approved |

### 13.2 New or extended endpoints required

- Native sign-in/authorization, refresh, logout, and device-session revoke contract.
- Agency selection/switch contract if not already handled by native session claims.
- Reference catalog endpoint for branches, categories, expense categories, and allowed values.
- Booking quote/price-preview endpoint if booking creation currently only confirms.
- Optional checkout/check-in preview endpoints when charge calculation or readiness must be reviewed before commit.
- Upload authorization/finalization endpoints or a documented multipart streaming contract suitable for hosted private storage.
- Customer/booking identity-image endpoints that accept only allowed side classifications, prevent cross-tenant attachment, and return upload status without exposing storage keys.
- Idempotency-result lookup or safe repeat behavior for timed-out mutations.
- Capability fields on session and record DTOs.
- Cache support using `ETag`/`If-None-Match`, `Last-Modified`, or a documented cursor where useful.
- OpenAPI 3 document with examples and stable error codes.

### 13.3 Standard envelope

Success:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

Failure:

```json
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "The vehicle is no longer available for the selected period.",
    "fieldErrors": {},
    "requestId": "req_..."
  }
}
```

Mobile maps stable codes—not English text—to recovery behavior.

### 13.4 Required headers

```text
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: <uuid>             # supported mutation endpoints
X-Client-Version: <semantic-version>
X-Platform: android|ios
X-Request-ID: <uuid>                # optional client correlation; server remains authoritative
```

Do not send `agencyId`, role, price authority, or permission claims as trusted client values.

### 13.5 Version and conflict behavior

- Mutable DTOs expose `version` and `updatedAt` where concurrent edits are possible.
- Update commands send the expected version.
- Server returns `VERSION_CONFLICT` with safe current-record metadata.
- App offers Reload and Review changes; it does not overwrite silently.
- Booking conflicts use `BOOKING_CONFLICT`, preserve draft inputs, and require a new availability result.

## 14. Data, caching, and offline behavior

### 14.1 Cacheable read models

- Session display metadata and capabilities.
- Today list.
- Recent booking summaries.
- Fleet summaries.
- Reference catalogs.
- Recently opened customer/booking/vehicle detail where policy permits.

### 14.2 Never cache by default

- Access or refresh tokens outside secure storage.
- Raw CNIC/license image bytes.
- Temporary front/back ID captures after successful upload, cancellation, sign-out, agency switch, or draft expiry.
- Unmasked CNIC unless a separately reviewed encrypted requirement exists.
- Payment-card data.
- Full request/response logs.
- Signed URLs beyond their validity.

### 14.3 Cache rules

- Every cached record is partitioned by agency ID and, where relevant, branch scope.
- Every record stores `fetchedAt`, server `updatedAt`/version, and schema version.
- Logout, agency switch, membership removal, or device revoke purges protected cache.
- Cached operational screens show their age when the network is unavailable.
- The network request result—not connectivity-plugin state—decides whether an operation succeeded.
- Retry only safe reads automatically. Mutations retry only through an idempotent contract.

### 14.4 Offline policy

| Action | Offline behavior |
| --- | --- |
| Browse cached Today/fleet/recent records | Allowed with stale label |
| Search records not in cache | Explain that connection is required |
| Start filling a form | Allowed in memory where useful |
| Confirm booking | Block until server reachable |
| Checkout/check-in | Block final submission until server reachable; retain in-progress local form temporarily if securely feasible |
| Payment/refund/payout | Block |
| Upload evidence | Queue files only within the active draft; do not mark the business action complete |

## 15. Security and privacy requirements

- HTTPS only outside local development.
- Store refresh/access secrets in iOS Keychain/Android Keystore through secure storage.
- Never place secrets in `shared_preferences`, Drift, source control, crash reports, analytics, screenshots, or clipboard without explicit user action.
- Redact Authorization, cookies, CNIC, license, phone, email, document paths, signed URLs, and file bytes from logs.
- Apply screen-capture blocking only after testing its operational impact; at minimum use it on sensitive identity/photo views if approved.
- Use system pickers and least privilege; do not request broad photo/storage access when camera or selected-file access is enough.
- Strip photo GPS metadata unless location evidence is an explicit approved requirement.
- Store ID-card captures only in app-private temporary storage before upload; never save them to the public photo gallery automatically.
- Treat front/back ID images as highly sensitive private files with explicit access checks and audit events for upload, view, replacement, and deletion.
- Apply server-side MIME sniffing, size limits, tenant checks, and malware policy; client checks are only convenience.
- Clear clipboard after timed reveal/copy of sensitive values where platform behavior permits.
- Do not implement certificate pinning in MVP unless operations can safely rotate pins; standard TLS validation plus secure deployment is preferred initially.
- No session replay on authentication, CNIC, license, payment, contract, or evidence screens.
- Define identity-document retention, access audit, deletion/anonymization, and breach response before real documents are accepted.

## 16. Accessibility and responsive quality

- Support Android TalkBack and iOS VoiceOver for every core flow.
- Every icon-only action has a semantic label and tooltip where appropriate.
- Status and validation never rely only on color.
- Focus moves to the first invalid field or error summary on submit.
- Dynamic type/text scaling must not hide actions or truncate critical values.
- Minimum interactive target is 48 logical pixels.
- Forms work with external keyboards and correct next/done actions.
- Date/time, money, phone, and CNIC values have human-readable semantics.
- Photos include slot/condition descriptions, not visual thumbnails alone.
- Test with Flutter's accessibility guideline API, Android Accessibility Scanner, and Xcode Accessibility Inspector. See [Flutter accessibility testing](https://docs.flutter.dev/ui/accessibility/accessibility-testing).

## 17. Reliability and error behavior

### 17.1 Error classes

| Type | Example | App response |
| --- | --- | --- |
| Validation | Invalid date/CNIC | Inline fields plus summary |
| Authentication | Expired access token | One serialized refresh attempt; sign out if refresh fails |
| Authorization | Role/branch revoked | Remove action, explain, refresh session |
| Conflict | Booking/version changed | Preserve input and open conflict recovery |
| Rate limit | Too many searches/uploads | Show retry time; do not hammer API |
| Network | Timeout/no route | Preserve screen data, show retry/offline state |
| Upload | One photo fails | Retry that file without discarding others |
| Server | Internal error | Safe message, request ID, retry where safe |
| Maintenance/version | API requires newer app | Blocking update screen with store link |

### 17.2 Timeouts and retries

- Separate connect, receive, and upload timeouts.
- Cancel obsolete searches and requests when screens dispose.
- Exponential backoff with jitter for safe reads only.
- Token refresh uses a single-flight guard.
- A mutation timeout is treated as unknown outcome. Resolve using idempotency/result lookup before offering resubmit.

## 18. Observability and product analytics

### 18.1 Operational telemetry

- App version/build, platform, OS version, environment.
- Request route template, request ID, duration, status/error code.
- Upload duration/size bucket and safe failure category.
- Authentication refresh/revoke outcomes without token content.
- Crash and unhandled error traces with redaction.

### 18.2 Product events

- `today_viewed`
- `booking_flow_started`
- `booking_confirmed`
- `booking_conflict_seen`
- `checkout_started` / `checkout_completed`
- `checkin_started` / `checkin_completed`
- `expense_submitted`
- `offline_cache_viewed`
- `form_validation_failed` with safe field identifiers only

Never attach customer names, phones, CNIC, plates, free-text notes, amounts tied to a person, or photo/document data to analytics.

## 19. Testing strategy

### 19.1 Unit tests

- DTO/envelope/error decoding.
- Date/time conversion around Pakistan-local day boundaries.
- PKR formatting.
- Input formatting and local validation.
- View-model loading, refresh, error, stale, and conflict states.
- Auth refresh single-flight behavior.
- Cache tenant partition and purge.
- Idempotency key lifetime.

### 19.2 Widget tests

- Shared async, error, empty, status, filter, form, confirmation, and evidence components.
- Text scaling and narrow-width behavior.
- Semantic labels and focus order.
- Booking, checkout, and check-in step transitions.
- Golden tests for light theme primitives at representative phone sizes.

### 19.3 API contract tests

- Generated/maintained OpenAPI examples decode in Dart.
- Success/error envelopes and stable codes.
- Authentication, role, agency, and branch rejection.
- Pagination/filter behavior.
- Idempotent repeat behavior.
- Version and booking conflicts.
- Multipart or direct-to-storage upload lifecycle.

### 19.4 Integration tests

Against a disposable backend/database:

1. Sign in and restore session.
2. Search/create customer with duplicate handling.
3. Search availability and confirm booking.
4. Perform checkout with evidence.
5. Perform check-in and review server-calculated charges.
6. Submit an expense with receipt.
7. Revoke session and verify local purge.
8. Switch agency and prove cache isolation.
9. Simulate timeout after mutation and prove no duplicate.

### 19.5 Device matrix

- One lower-memory Android device representative of agency staff hardware.
- Current mainstream Android phone.
- Small iPhone and current mainstream iPhone.
- Slow/unstable network profiles, airplane-mode transitions, background/resume, process death, camera denial, low storage, and expired credentials.

## 20. Build, environments, and release

### 20.1 Environments

- `development`: local/disposable data, verbose safe diagnostics.
- `staging`: production-like HTTPS backend and test agencies.
- `production`: real tenant data, restricted diagnostics.

Use distinct bundle/application IDs, icons or visible labels for non-production builds, API origins, signing, and push configuration if later added. Base URLs are compile-time environment configuration; secrets are never bundled.

### 20.2 CI quality gates

```text
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter test integration_test   # on scheduled/device job
flutter build appbundle         # Android release candidate
flutter build ipa               # iOS release candidate on macOS signing runner
```

Also run backend lint, typecheck, build, migrations, integration checks, and API contract tests for contract changes.

### 20.3 Distribution

- Android: internal testing track first, then closed pilot.
- iOS: TestFlight first.
- Use staged rollout and server-enforced minimum-supported version only for critical contract/security changes.
- Maintain release notes, rollback/disable plan, privacy disclosures, support contact, and tested account/session revocation.

## 21. Delivery plan

### Phase M0 — Decisions and contract foundation

- Approve this PRD and mobile scope.
- Decide hosted versus same-LAN pilot; hosted is recommended for a true mobile product.
- Complete native authentication spike and ADR.
- Freeze MVP OpenAPI subset and error/idempotency conventions.
- Decide hosted private-file storage.
- Create Flutter project, flavors, CI, theme, routing, API client, secure storage, and shared primitives.

**Exit:** A signed-in test user can call `/api/v1/session` securely from Android and iOS staging builds; contract and revocation tests pass.

### Phase M1 — Read-only operational slice

- Today.
- Booking list/detail.
- Fleet list/detail and availability.
- Session/agency/branch context.
- Read cache, stale labels, and pull to refresh.

**Exit:** Pilot users can reliably understand today's work on slow and intermittent networks without stale data appearing live.

### Phase M2 — Booking and customer intake

- Customer search/create and duplicate handling.
- Booking wizard, quote/review, idempotent confirmation, conflict recovery.
- Deep links and state restoration.

**Exit:** Mobile can create a valid non-overlapping booking through documented APIs without duplicated business rules.

### Phase M3 — Rental operations and evidence

- Checkout/check-in forms.
- Condition checklist, odometer/fuel, photo upload, progress/retry.
- Charge preview and final server-confirmed transitions.

**Exit:** A complete rental can be checked out and in with private evidence, transactional state changes, and audit events.

### Phase M4 — Expenses and pilot hardening

- Expense capture and receipt.
- Activity center.
- Crash reporting/operational dashboards.
- Accessibility/device/network QA, security review, backup/restore drill, app-store pilot.

**Exit:** Closed pilot release gates and success metrics are measurable.

### Phase M5 — Evidence-led expansion

Only after pilot evidence:

- Push notifications.
- Payment posting.
- Vehicle edits/maintenance blocks.
- CNIC OCR.
- Urdu localization.
- Owner or customer apps as separate products.
- Carefully scoped offline mutations if the field environment proves they are essential.

## 22. Team and ownership

Minimum accountable roles, even if one person fills several:

- Product owner: scope, workflow, pilot success.
- Flutter engineer: client architecture and platform releases.
- Backend engineer: auth, contracts, services, files, observability.
- Product designer: mobile flows, accessibility, evidence capture usability.
- QA owner: device/network matrix and release evidence.
- Security/operations reviewer: token lifecycle, sensitive documents, deployment, backup/restore, incident plan.

## 23. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Treating desktop-local server as an internet backend | Unreliable/insecure remote app | Choose hosted HTTPS or explicitly constrain same-LAN pilot |
| Native auth bolted onto web cookies | Session theft/poor revocation | Approve native token design before feature work |
| SQLite write pressure from mobile traffic | Lock contention | One instance, short transactions, measure contention, apply documented PostgreSQL triggers |
| Mobile duplicates business rules | Web/mobile disagreement | Server-owned services and contract tests |
| Timeout causes duplicate booking/payment | Financial/availability errors | Idempotency keys and outcome lookup |
| Cached data appears current | Operational mistakes | Cache age labels and server-required writes |
| Sensitive photos/CNIC leak | Severe privacy breach | Private storage, least privilege, redacted telemetry, retention policy |
| Huge photos stall devices/uploads | Failed field workflows | Compression, per-file progress/retry, size limits |
| Too much web functionality copied into MVP | Slow, cluttered release | Field-operations scope and web-first admin boundary |
| Package churn | Upgrade/build failures | Lockfile, controlled upgrades, review migration guides, minimize dependencies |

## 24. Definition of done for MVP

MVP is done only when:

- M-01 through M-13 acceptance requirements in scope are implemented.
- Android and iOS staging builds use the same documented `/api/v1` contract.
- No Flutter code accesses backend SQLite or contains authoritative pricing/availability/status rules.
- Native authentication, rotation, revocation, and secure storage pass review.
- Booking, checkout, check-in, and expense mutations are idempotent where required.
- Private evidence upload/download is tenant-isolated and audited.
- Unit, widget, contract, and core integration tests pass.
- Core flows pass manual QA on the defined device/network matrix.
- Accessibility audits pass with no critical issues.
- Logs, crash reports, and analytics are verified to exclude sensitive content.
- Hosted API backup restoration and incident procedures are tested.
- App-store/TestFlight metadata, privacy disclosures, support, and staged rollout are ready.

## 25. Decisions required now

1. **Pilot reach:** Hosted internet-accessible mobile app (recommended) or same-LAN companion only?
2. **Platform launch:** Android-first closed pilot with iOS compatibility (recommended) or simultaneous public release?
3. **Authentication:** Approve the native auth spike and ADR before UI feature development.
4. **Files:** Choose private object storage and retention policy before evidence capture ships.
5. **Finance:** Keep mobile payment posting outside MVP (recommended) or add a separately specified, idempotent finance phase?

## 26. Recommended first implementation slice

Build a walking skeleton, not several disconnected screens:

1. Flutter flavors, VibeRent theme, routing, and shared async/error components.
2. Native sign-in/session restoration against staging.
3. `GET /api/v1/session` and `GET /api/v1/operations/today` through typed DTOs and repository.
4. Today screen with live, loading, cached-stale, empty, unauthorized, and error states.
5. Open a booking detail from Today and return with state preserved.
6. Run unit, widget, contract, Android device, and iOS simulator checks.

This slice proves the highest-risk boundaries—deployment, native authentication, API contracts, state handling, navigation, and cache honesty—before investing in the booking and camera-heavy workflows.
