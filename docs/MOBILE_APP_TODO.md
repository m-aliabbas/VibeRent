# VibeRent Mobile Application TODO

Source of truth: [MOBILE_APP_PRD.md](./MOBILE_APP_PRD.md)

**Status:** Planning

**Target:** Android-first closed pilot with iOS compatibility

**Frontend:** Flutter

**Backend:** Existing Next.js modular monolith through `/api/v1`

## Working rules

- [ ] Keep Flutter as an API client; never access or copy the backend SQLite database.
- [ ] Keep authorization, availability, pricing, status transitions, transactions, and audit rules on the server.
- [ ] Do not start high-risk mobile workflows until native authentication and HTTPS deployment are approved.
- [ ] Do not mark a task complete without its tests and verification evidence.
- [ ] Update this file and the PRD when scope or architecture changes.

## M0 — Product and architecture decisions

### Pilot scope

- [ ] Approve the staff-only MVP scope in `MOBILE_APP_PRD.md`.
- [ ] Confirm hosted HTTPS pilot or same-LAN companion pilot.
- [ ] Use hosted single-instance deployment for a remotely accessible pilot unless explicitly changed.
- [ ] Confirm Android-first closed pilot with iOS-compatible implementation.
- [ ] Keep customer app, owner portal, full reports, settings, backups, and staff administration outside MVP.
- [ ] Keep payment posting, refunds, and payouts outside MVP unless separately approved.

### Native authentication

- [ ] Write and approve a native authentication ADR.
- [ ] Evaluate Better Auth OAuth 2.1/PKCE and bearer capabilities against mobile requirements.
- [ ] Select the final native sign-in flow.
- [ ] Define short-lived access-token lifetime.
- [ ] Define rotating refresh-token behavior and reuse detection.
- [ ] Define device-session creation, listing, and revocation.
- [ ] Ensure password reset and staff deactivation revoke applicable mobile sessions.
- [ ] Add authentication rate limits.
- [ ] Add automated token rotation and revocation tests.

### Hosting and operations

- [ ] Select the staging and production hosting topology.
- [ ] Provision one writable backend instance with persistent storage while SQLite remains in use.
- [ ] Configure HTTPS and production domain names.
- [ ] Configure database and private-file backups.
- [ ] Test backup restoration.
- [ ] Add readiness, liveness, migration-version, disk-space, and backup-age checks.
- [ ] Define PostgreSQL migration triggers and operational owner.
- [ ] Select crash reporting/error tracking with privacy review.

### Private files

- [ ] Select private object-storage provider.
- [ ] Define agency-separated storage prefixes.
- [ ] Define supported MIME types and size limits.
- [ ] Define signed download URL or authorized streaming behavior.
- [ ] Define photo metadata stripping and image compression requirements.
- [ ] Define `cnic_front` and `cnic_back` private-file classifications.
- [ ] Define customer/booking identity-image access, replacement, deletion, and audit rules.
- [ ] Define malware-scanning policy for documents.
- [ ] Approve CNIC, license, receipt, contract, and condition-photo retention rules.
- [ ] Add tenant-isolation and authorization tests for files.

## M1 — API contract readiness

### Contract foundation

- [ ] Create and publish the mobile OpenAPI 3 contract.
- [ ] Freeze the MVP `/api/v1` resource subset.
- [ ] Document `{ data, meta }` success envelopes.
- [ ] Document `{ error }` failure envelopes and stable error codes.
- [ ] Document ISO 8601 timestamp and `Asia/Karachi` presentation rules.
- [ ] Confirm whole-PKR integer representation for MVP.
- [ ] Document cursor pagination and bounded page sizes.
- [ ] Add `version` and `updatedAt` to concurrently editable DTOs.
- [ ] Add API contract tests that run against a disposable database.

### Session and capabilities

- [ ] Extend `GET /api/v1/session` with mobile-safe capabilities where required.
- [ ] Return active agency and permitted branch context.
- [ ] Define agency-switch behavior for multi-agency users.
- [ ] Ensure the server derives agency, role, and branch scope from the authenticated session.
- [ ] Add cross-agency and cross-branch rejection tests.

### Idempotency and conflicts

- [ ] Define the `Idempotency-Key` contract.
- [ ] Add idempotency storage and expiry policy.
- [ ] Make booking confirmation idempotent.
- [ ] Make checkout and check-in idempotent.
- [ ] Make expense submission idempotent where duplicate creation is possible.
- [ ] Add safe mutation-result lookup or repeat-response behavior after timeouts.
- [ ] Return `VERSION_CONFLICT` for stale edits.
- [ ] Return `BOOKING_CONFLICT` for lost availability.
- [ ] Add duplicate-request and timeout-recovery tests.

### Existing endpoint hardening

- [ ] Document filters and pagination for `GET /api/v1/vehicles`.
- [ ] Document filters and pagination for `GET /api/v1/bookings`.
- [ ] Add availability reasons where useful to `GET /api/v1/vehicles/availability`.
- [ ] Include record capabilities/readiness in booking detail.
- [ ] Define duplicate-customer candidate responses.
- [ ] Define receipt/file references for expense submission.
- [ ] Add mobile-safe ID front/back upload and status endpoints.
- [ ] Reject missing, duplicate, invalid-side, cross-agency, and unauthorized ID-image attachments.
- [ ] Add cache validators or documented sync cursors to suitable read endpoints.
- [ ] Add reference-catalog endpoint for branches, categories, and allowed values.
- [ ] Add booking quote/price-preview endpoint if confirmation is currently the only pricing operation.
- [ ] Define checkout/check-in preview behavior for readiness and calculated charges.

## M2 — Flutter project foundation

### Bootstrap

- [ ] Create the Flutter project under `mobile/`.
- [ ] Pin the Flutter SDK version used by CI and developers.
- [ ] Add development, staging, and production entry points.
- [ ] Configure distinct application IDs and visible non-production labels.
- [ ] Configure Android and iOS signing without committing secrets.
- [ ] Add environment-specific API base URLs.
- [ ] Add a checked-in dependency lockfile.

### Core package setup

- [ ] Add `flutter_riverpod` for state and dependency injection.
- [ ] Add `go_router` with typed routes.
- [ ] Add `dio` behind a single `ApiClient`.
- [ ] Add `freezed` and `json_serializable` for immutable models.
- [ ] Add `flutter_secure_storage` for mobile session secrets.
- [ ] Configure Flutter `gen_l10n` and `intl`.
- [ ] Add `shared_preferences` only for non-sensitive UI preferences.
- [ ] Add Drift when the first cached-read acceptance criterion is implemented.
- [ ] Add Flutter's `camera` plugin for guided ID-card capture.
- [ ] Add `image_picker` when evidence capture begins.
- [ ] Avoid adding Bloc, GetX, a service locator, or a second HTTP client.

### Project architecture

- [ ] Create `app`, `core`, and feature-first directories from the PRD.
- [ ] Implement service, repository, view-model, and view boundaries.
- [ ] Create typed API envelope and error models.
- [ ] Create a redacting logger interface.
- [ ] Create clock/timezone and PKR formatting utilities.
- [ ] Create secure token-store abstraction.
- [ ] Create tenant-aware cache abstraction.
- [ ] Create media-picker and media-processing abstractions.
- [ ] Prevent widgets from importing Dio, Drift, or secure storage directly.

### CI

- [ ] Run formatting checks.
- [ ] Run `flutter analyze`.
- [ ] Run unit and widget tests.
- [ ] Build an Android App Bundle in CI.
- [ ] Build an iOS archive on a macOS signing runner.
- [ ] Add scheduled integration/device tests.
- [ ] Run backend contract tests when OpenAPI or `/api/v1` changes.

## M3 — Shared design system and application shell

### Theme and layout

- [ ] Implement VibeRent primary blue `#006FE6`.
- [ ] Implement main text `#19191F` and canvas `#F8FAFC`.
- [ ] Implement 12 px card/field radius and shared spacing tokens.
- [ ] Configure Material 3 light theme.
- [ ] Define semantic success, warning, error, and info styles.
- [ ] Ensure status never relies on color alone.
- [ ] Respect reduced-motion and text-scaling settings.

### Shared components

- [ ] `VibeRentAppShell` with four bottom destinations.
- [ ] `AppTopBar`.
- [ ] `PageScaffold`.
- [ ] Primary, secondary, and danger buttons with loading states.
- [ ] `AsyncContent<T>`.
- [ ] `ErrorState` with request ID and retry.
- [ ] `EmptyState` and `FilteredEmptyState`.
- [ ] `OfflineBanner` and `StaleDataBanner`.
- [ ] `StatusBadge`.
- [ ] `RecordCard`.
- [ ] `SearchField`.
- [ ] `FilterSheet` and active filter chips.
- [ ] `MoneyText`.
- [ ] Local date and date-time components.
- [ ] `SectionCard` and `KeyValueRow`.
- [ ] Shared text, phone, CNIC, money, select, and date-time fields.
- [ ] `FuelLevelField` and `OdometerField`.
- [ ] `ConditionChecklist`.
- [ ] `IdentityCardCapture` with separate front/back states.
- [ ] `EvidencePhotoGrid` and `UploadTile`.
- [ ] `ConfirmationSheet` and `ConflictSheet`.
- [ ] `PermissionBoundary`.
- [ ] `RequestInFlightGuard`.
- [ ] `SensitiveValue` mask/reveal component.

### Navigation

- [ ] Add Today, Bookings, Fleet, and More shell routes.
- [ ] Add record-detail and workflow routes from the PRD.
- [ ] Add authentication redirects with intended-route restoration.
- [ ] Add deep-link configuration for Android and iOS.
- [ ] Verify back navigation and state restoration.

## M4 — Authentication and session experience

- [ ] Implement launch/session-restoration state.
- [ ] Implement sign-in form with password-manager autofill.
- [ ] Implement the approved native auth flow.
- [ ] Serialize concurrent token refresh attempts.
- [ ] Store secrets only in secure storage.
- [ ] Implement forced-logout reasons.
- [ ] Implement agency selection for multi-agency users.
- [ ] Implement branch context display/selection where permitted.
- [ ] Purge tenant data before switching agencies.
- [ ] Implement sign out with server session revocation.
- [ ] Clear secure secrets and protected caches on sign out.
- [ ] Add authentication and cache-purge unit/integration tests.

## M5 — Read-only operational slice

### Today

- [ ] Implement Today repository, DTOs, view model, and screen.
- [ ] Show pickups, returns, overdue work, and recently completed work.
- [ ] Show readiness and exception warnings with text/icons.
- [ ] Add permission-aware quick actions.
- [ ] Add pull to refresh.
- [ ] Add last-updated and stale-cache labels.
- [ ] Add loading, empty, error, offline, and partial-data states.

### Booking list and detail

- [ ] Implement booking search and filters.
- [ ] Implement cursor pagination and retry row.
- [ ] Preserve list filters during detail navigation.
- [ ] Implement booking detail with status, schedule, customer, vehicle, pricing, and balance.
- [ ] Show server-returned readiness blockers and capabilities.
- [ ] Show inspection and activity history.
- [ ] Add the correct state-aware primary action.

### Fleet list and detail

- [ ] Implement fleet search and filters.
- [ ] Implement mobile vehicle cards.
- [ ] Implement vehicle detail.
- [ ] Show status, location, odometer, ownership, rate, and warnings.
- [ ] Implement interval availability search.
- [ ] Label cached fleet data as non-authoritative for booking.

### Read cache

- [ ] Add Drift schema and migrations for approved cached read models.
- [ ] Partition all cached data by agency and branch scope.
- [ ] Store cache timestamps and server record versions.
- [ ] Implement bounded eviction and schema migration.
- [ ] Purge protected cache after logout, revoke, or agency switch.
- [ ] Test cache isolation and stale-data presentation.

## M6 — Customer and booking creation

### Customers

- [ ] Implement customer search by allowed fields.
- [ ] Implement customer detail with masked identity values.
- [ ] Implement customer creation form.
- [ ] Add Pakistani phone and CNIC input formatting.
- [ ] Handle server-returned duplicate candidates.
- [ ] Preserve form values after validation failures.
- [ ] Ensure sensitive values never enter analytics or general preferences.

### ID card/CNIC camera capture

- [ ] Add a **Capture ID card** action to customer creation and the approved booking-intake location.
- [ ] Open an in-app rear-camera preview rather than an uncontrolled external camera.
- [ ] Show a card-shaped framing overlay and **Front side** instructions.
- [ ] Capture the front side and show a full review screen.
- [ ] Provide **Retake** and **Use photo** actions.
- [ ] Continue to a separately labeled **Back side** capture.
- [ ] Capture the back side and show a full review screen.
- [ ] Keep front and back files in distinct state and never swap their classifications.
- [ ] Add flash control and clear camera-permission recovery guidance.
- [ ] Add quality hints for blur, glare, darkness, and cutoff edges.
- [ ] Correct orientation and process compression off the UI isolate.
- [ ] Strip unnecessary location metadata.
- [ ] Store captures only in app-private temporary storage before upload.
- [ ] Upload as `cnic_front` and `cnic_back` private files.
- [ ] Show independent progress, failure, and retry for both sides.
- [ ] Require both confirmed uploads when agency policy requires ID images.
- [ ] Allow an authorized policy-based skip with a required reason when permitted.
- [ ] Delete local temporary images after success, cancellation, sign-out, agency switch, or draft expiry.
- [ ] Add a policy-controlled gallery fallback without making it the default.
- [ ] Keep OCR outside this task unless separately approved.
- [ ] Add widget tests for capture order, retake, permission denial, and side labels.
- [ ] Add integration tests for upload, retry, cancellation cleanup, tenant isolation, and audit events.

### Booking wizard

- [ ] Implement step 1: branch/city and pickup/return interval.
- [ ] Implement step 2: server-confirmed available vehicle selection.
- [ ] Implement step 3: existing or new customer.
- [ ] Implement step 4: server price preview, extras, deposit, and allowed discount.
- [ ] Implement step 5: review and confirmation.
- [ ] Preserve the in-session draft between steps.
- [ ] Generate one idempotency key per submit intent.
- [ ] Add unknown-outcome handling after a timeout.
- [ ] Handle `BOOKING_CONFLICT` without discarding customer and schedule inputs.
- [ ] Prevent double taps and duplicate submissions.
- [ ] Add booking creation integration tests.

## M7 — Checkout, check-in, and evidence

### Media pipeline

- [ ] Implement camera/gallery permission handling.
- [ ] Implement required evidence slots.
- [ ] Correct image orientation.
- [ ] Compress images off the UI isolate.
- [ ] Strip unnecessary location metadata.
- [ ] Show per-file progress, failure, retry, replace, and delete.
- [ ] Support resumable or safely repeatable upload behavior where the backend allows it.
- [ ] Never mark a workflow complete because files exist only on the device.

### Checkout

- [ ] Implement readiness review.
- [ ] Capture actual handover time.
- [ ] Capture and validate odometer.
- [ ] Capture accessible fuel level.
- [ ] Capture condition checklist, evidence photos, accessories, and notes.
- [ ] Implement final review.
- [ ] Submit checkout with idempotency and uploaded file references.
- [ ] Show success only after the updated booking is returned.
- [ ] Add transactional checkout integration tests.

### Check-in

- [ ] Display checkout baseline beside return inputs.
- [ ] Capture actual return time, odometer, fuel, condition, photos, accessories, and notes.
- [ ] Highlight new damage, fuel difference, excess distance, and lateness.
- [ ] Display server-calculated charge preview.
- [ ] Require permission and reason for waived charges.
- [ ] Capture vehicle disposition where supported.
- [ ] Submit check-in with idempotency.
- [ ] Add transactional check-in integration tests.

## M8 — Expenses and activity

### Expenses

- [ ] Implement amount, category, date, description, and entity links.
- [ ] Implement optional receipt capture/upload.
- [ ] Display submitted/approved/rejected status returned by the server.
- [ ] Prevent silent editing of approved financial records.
- [ ] Add validation, duplicate-submit, and upload-failure tests.

### Activity and notifications

- [ ] Implement cursor-paginated activity feed.
- [ ] Add entity deep links.
- [ ] Add in-app attention items for overdue work, conflicts, and upload failures.
- [ ] Decide whether push notifications are required for the pilot.
- [ ] If approved, define non-sensitive push payloads and permission timing.

## M9 — Profile, support, and diagnostics

- [ ] Show user name, role, agency, and branch scope.
- [ ] Show app version, build, and environment.
- [ ] Add privacy, help, and support links.
- [ ] Add safe API reachability and last-sync diagnostics.
- [ ] Show request ID for the latest recoverable server error.
- [ ] Add minimum-supported-version handling and update links.
- [ ] Verify that desktop backup, licensing, and Google Drive controls are absent.

## M10 — Security, accessibility, and privacy QA

### Security

- [ ] Run mobile threat-model review.
- [ ] Verify HTTPS-only production behavior.
- [ ] Verify secrets are absent from preferences, Drift, logs, and crash reports.
- [ ] Verify request/response bodies are not logged.
- [ ] Verify ID-card images never enter screenshots, analytics, crash attachments, public galleries, or general caches.
- [ ] Verify tenant cache purge and file authorization.
- [ ] Test token theft, reuse, expiry, refresh, revoke, and deactivated-user cases.
- [ ] Test rate-limit handling.
- [ ] Test deep links while signed out and with revoked access.
- [ ] Review screen-capture policy for sensitive identity/photo screens.
- [ ] Review clipboard handling for sensitive values.

### Accessibility

- [ ] Test all core flows with Android TalkBack.
- [ ] Test all core flows with iOS VoiceOver.
- [ ] Run Flutter accessibility guideline tests.
- [ ] Run Android Accessibility Scanner.
- [ ] Run Xcode Accessibility Inspector.
- [ ] Verify 48 x 48 minimum touch targets.
- [ ] Verify text scaling without hidden actions or clipped critical values.
- [ ] Verify labels for icon-only controls, status, photos, and form errors.
- [ ] Verify focus moves to validation errors.
- [ ] Verify reduced-motion behavior.

### Privacy

- [ ] Verify analytics contain no names, phone numbers, CNIC, plates, notes, files, or tokens.
- [ ] Verify crash reports are redacted.
- [ ] Verify no session replay runs on sensitive screens.
- [ ] Prepare platform privacy disclosures.
- [ ] Document data deletion/anonymization and incident-response procedures.

## M11 — Testing and release

### Automated verification

- [ ] DTO and API error decoding tests pass.
- [ ] PKR and timezone boundary tests pass.
- [ ] View-model state tests pass.
- [ ] Shared component widget tests pass.
- [ ] Golden tests pass at representative phone sizes.
- [ ] OpenAPI contract tests pass.
- [ ] Core end-to-end integration tests pass against a disposable backend.
- [ ] Backend lint, typecheck, build, migration, and transaction checks pass.

### Device and network verification

- [ ] Test a lower-memory Android device.
- [ ] Test a mainstream Android device.
- [ ] Test a small iPhone.
- [ ] Test a mainstream iPhone.
- [ ] Test slow and unstable network profiles.
- [ ] Test airplane-mode transitions.
- [ ] Test background/resume and process death.
- [ ] Test denied camera/photo permissions.
- [ ] Test low-storage and large-photo behavior.
- [ ] Test expired and revoked credentials.
- [ ] Confirm no critical console/native errors.

### Pilot release

- [ ] Prepare Android internal-testing release.
- [ ] Prepare iOS TestFlight release.
- [ ] Add release notes and support contact.
- [ ] Add staged rollout and rollback/disable plan.
- [ ] Verify production monitoring and alerts.
- [ ] Run backup restoration drill.
- [ ] Complete security and privacy sign-off.
- [ ] Complete product-owner acceptance walkthrough.
- [ ] Release to closed pilot.
- [ ] Measure PRD success metrics and record pilot findings.

## Definition of done

- [ ] MVP requirements M-01 through M-13 are complete at the approved scope.
- [ ] Flutter contains no direct database access or duplicated authoritative business rules.
- [ ] Native authentication and session revocation pass security review.
- [ ] Booking, checkout, check-in, and expense mutations are safely idempotent.
- [ ] Evidence files are private, tenant-isolated, authorized, and auditable.
- [ ] Core automated and manual verification passes.
- [ ] Accessibility has no unresolved critical issue.
- [ ] Telemetry is verified to exclude sensitive data.
- [ ] Production recovery procedures have been exercised.
- [ ] Android and iOS pilot artifacts are signed and distributable.
