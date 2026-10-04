import assert from "node:assert/strict";
import test from "node:test";
import { getDeviceFingerprint, getDeviceFingerprintPayload } from "../src/server/desktop/device-identity";
import {
  DEFAULT_LICENSE_TERM_DAYS,
  evaluateLicenseDocument,
  resolveLicenseExpiry,
} from "../src/server/desktop/license-policy";

const now = new Date("2026-10-04T12:00:00.000Z");

test("a newly registered device receives a 30-day expiry", () => {
  const resolved = resolveLicenseExpiry({}, now);
  assert.equal(resolved.needsBackfill, true);
  assert.equal(
    resolved.expiresAt.toISOString(),
    new Date(now.getTime() + DEFAULT_LICENSE_TERM_DAYS * 86_400_000).toISOString(),
  );
});

test("approving a legacy VibeRent document without expiry becomes active after backfill", () => {
  const license = { approved: true, disabled: false };
  const resolved = resolveLicenseExpiry(license, now);
  assert.equal(resolved.needsBackfill, true);
  assert.equal(evaluateLicenseDocument(license, resolved.expiresAt, now), "active");
});

test("snake_case VibePOS expiry remains compatible", () => {
  const license = { approved: true, disabled: false, expire_date: "2026-11-02T12:00:00.000Z" };
  const resolved = resolveLicenseExpiry(license, now);
  assert.equal(resolved.needsBackfill, false);
  assert.equal(evaluateLicenseDocument(license, resolved.expiresAt, now), "active");
});

test("disabled and expired licenses remain blocked", () => {
  assert.equal(evaluateLicenseDocument({ approved: true, disabled: true }, new Date("2026-11-02T12:00:00.000Z"), now), "revoked");
  assert.equal(evaluateLicenseDocument({ approved: true }, new Date("2026-10-03T12:00:00.000Z"), now), "expired");
});

test("an invalid configured expiry is blocked instead of silently renewed", () => {
  const license = { approved: true, expireDate: "not-a-date" };
  const resolved = resolveLicenseExpiry(license, now);
  assert.equal(resolved.needsBackfill, false);
  assert.equal(evaluateLicenseDocument(license, resolved.expiresAt, now), "expired");
});

test("Node device identity includes the same diagnostic fields as VibePOS", () => {
  const payload = getDeviceFingerprintPayload();
  assert.equal(typeof payload.node, "string");
  assert.ok(payload.node.length > 0);
  assert.equal(typeof payload.system, "string");
  assert.equal(typeof payload.machine, "string");
  assert.equal(typeof payload.processor, "string");
  assert.equal(typeof payload.os_user, "string");
  assert.equal(typeof payload.mac, "number");
  assert.match(getDeviceFingerprint("viberent"), /^[a-f0-9]{64}$/);
});
