import "server-only";

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cert, getApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { DomainError } from "@/server/domain/errors";
import {
  getDeviceFingerprint,
  getDeviceFingerprintPayload,
  type DeviceFingerprintPayload,
} from "@/server/desktop/device-identity";
import { loadFirebaseCredentials } from "@/server/desktop/encrypted-credentials";
import {
  defaultLicenseExpiry,
  evaluateLicenseDocument,
  resolveLicenseExpiry,
} from "@/server/desktop/license-policy";
import { readEncryptedJson, writeEncryptedJson } from "@/server/desktop/local-crypto";
import {
  getLicenseCachePath,
  getLicenseStatusPath,
  isDesktopRuntime,
} from "@/server/desktop/runtime-paths";

const FIREBASE_APP_NAME = "viberent-desktop-license";
const DEFAULT_LICENSE_COLLECTION = "viberent_licenses";
const OFFLINE_LICENSE_DAYS = 30;

export type LicenseState =
  | "disabled"
  | "active"
  | "pending"
  | "expired"
  | "revoked"
  | "unavailable"
  | "misconfigured";

export type DesktopLicenseStatus = {
  enforced: boolean;
  state: LicenseState;
  fingerprint: string;
  message: string;
  checkedAt: string;
  expiresAt?: string;
  offlineUntil?: string;
  device: DeviceFingerprintPayload;
};

let refreshPromise: Promise<DesktopLicenseStatus> | null = null;
let currentStatus: DesktopLicenseStatus | null = null;

function statusIsActive(status: DesktopLicenseStatus, fingerprint: string) {
  const offlineUntil = status.offlineUntil ? new Date(status.offlineUntil).getTime() : Number.NaN;
  const expiresAt = status.expiresAt ? new Date(status.expiresAt).getTime() : Number.NaN;
  return status.state === "active"
    && status.fingerprint === fingerprint
    && Number.isFinite(offlineUntil)
    && Number.isFinite(expiresAt)
    && offlineUntil > Date.now()
    && expiresAt > Date.now();
}

async function writeStatus(status: DesktopLicenseStatus) {
  currentStatus = status;
  const statusPath = getLicenseStatusPath();
  await mkdir(path.dirname(statusPath), { recursive: true });
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(status, null, 2), { mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(temporaryPath, statusPath);
  return status;
}

async function loadCachedStatus(fingerprint: string, device: DeviceFingerprintPayload) {
  const status = await readEncryptedJson<DesktopLicenseStatus>(getLicenseCachePath());
  if (!status || !statusIsActive(status, fingerprint)) return null;
  return {
    ...status,
    checkedAt: new Date().toISOString(),
    message: "License verified from the encrypted offline cache.",
    device,
  } satisfies DesktopLicenseStatus;
}

async function firebaseDatabase() {
  const credentials = await loadFirebaseCredentials();
  let app;
  try {
    app = getApp(FIREBASE_APP_NAME);
  } catch {
    app = initializeApp({
      credential: cert({
        projectId: credentials.project_id!,
        clientEmail: credentials.client_email!,
        privateKey: credentials.private_key!,
      }),
      projectId: process.env.FIREBASE_PROJECT_ID?.trim() || credentials.project_id,
    }, FIREBASE_APP_NAME);
  }
  return getFirestore(app);
}

async function checkOnlineLicense(fingerprint: string): Promise<DesktopLicenseStatus> {
  const database = await firebaseDatabase();
  const now = new Date();
  const device = getDeviceFingerprintPayload();
  const reference = database
    .collection(process.env.FIREBASE_LICENSE_COLLECTION?.trim() || DEFAULT_LICENSE_COLLECTION)
    .doc(fingerprint);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    if (process.env.LICENSE_AUTO_REGISTER !== "false") {
      await reference.set({
        applicationId: process.env.LICENSE_APPLICATION_ID || "viberent",
        approved: false,
        disabled: false,
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        appVersion: (process.env.VIBERENT_VERSION || "0.0.0").slice(0, 32),
        expireDate: defaultLicenseExpiry(now),
        fingerprint_payload: device,
      }, { merge: true });
    }
    return {
      enforced: true,
      state: "pending",
      fingerprint,
      message: "Device registered and waiting for administrator approval.",
      checkedAt: new Date().toISOString(),
      device,
    };
  }

  const license = snapshot.data() || {};
  const { expiresAt, needsBackfill } = resolveLicenseExpiry(license, now);
  const updates: Record<string, unknown> = {
    lastSeenAt: FieldValue.serverTimestamp(),
    appVersion: (process.env.VIBERENT_VERSION || "0.0.0").slice(0, 32),
    fingerprint_payload: device,
  };
  if (needsBackfill) updates.expireDate = expiresAt;
  await reference.set(updates, { merge: true });
  const state = evaluateLicenseDocument(license, expiresAt, now);
  if (state === "revoked") return { enforced: true, state, fingerprint, message: "This device license has been revoked.", checkedAt: now.toISOString(), device };
  if (state === "pending") return { enforced: true, state, fingerprint, message: "This device is waiting for administrator approval.", checkedAt: now.toISOString(), device };
  if (state === "expired") return { enforced: true, state, fingerprint, message: "This device license has expired.", checkedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), device };

  const offlineUntil = new Date(Math.min(
    expiresAt.getTime(),
    now.getTime() + OFFLINE_LICENSE_DAYS * 24 * 60 * 60 * 1000,
  ));
  const status: DesktopLicenseStatus = {
    enforced: true,
    state: "active",
    fingerprint,
    message: "License verified with Firebase.",
    checkedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    offlineUntil: offlineUntil.toISOString(),
    device,
  };
  await writeEncryptedJson(getLicenseCachePath(), status);
  return status;
}

async function refreshLicenseStatusInternal(): Promise<DesktopLicenseStatus> {
  const fingerprint = getDeviceFingerprint();
  const device = getDeviceFingerprintPayload();
  if (!isDesktopRuntime() || process.env.LICENSE_ENFORCEMENT !== "true") {
    return writeStatus({
      enforced: false,
      state: "disabled",
      fingerprint,
      message: "Desktop license enforcement is disabled for this runtime.",
      checkedAt: new Date().toISOString(),
      device,
    });
  }

  try {
    return writeStatus(await checkOnlineLicense(fingerprint));
  } catch {
    const cached = await loadCachedStatus(fingerprint, device);
    if (cached) return writeStatus(cached);
    return writeStatus({
      enforced: true,
      state: "misconfigured",
      fingerprint,
      message: "Firebase credentials are unavailable or the license service could not be reached.",
      checkedAt: new Date().toISOString(),
      device,
    });
  }
}

export function refreshDesktopLicense() {
  if (!refreshPromise) {
    refreshPromise = refreshLicenseStatusInternal().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export function getDesktopLicenseStatus(): DesktopLicenseStatus {
  const enforced = isDesktopRuntime() && process.env.LICENSE_ENFORCEMENT === "true";
  const fingerprint = getDeviceFingerprint();
  const device = getDeviceFingerprintPayload();
  let status = currentStatus;
  if (!status) {
    try {
      status = JSON.parse(readFileSync(getLicenseStatusPath(), "utf8")) as DesktopLicenseStatus;
    } catch {}
  }
  if (status && (!enforced || statusIsActive(status, fingerprint) || status.state !== "active")) {
    return { ...status, device: status.device ?? device };
  }
  return {
    enforced,
    state: enforced ? "unavailable" : "disabled",
    fingerprint,
    message: enforced ? "License verification has not completed." : "Desktop license enforcement is disabled.",
    checkedAt: new Date().toISOString(),
    device,
  };
}

export function startLicenseRefreshScheduler() {
  const runtime = globalThis as typeof globalThis & { __viberentLicenseTimer?: NodeJS.Timeout };
  if (runtime.__viberentLicenseTimer) return;
  runtime.__viberentLicenseTimer = setInterval(() => { void refreshDesktopLicense(); }, 24 * 60 * 60 * 1000);
  runtime.__viberentLicenseTimer.unref();
}

export function assertDesktopLicense() {
  const status = getDesktopLicenseStatus();
  if (status.enforced && status.state !== "active") {
    throw new DomainError("FORBIDDEN", "This VibeRent installation does not have an active license.", 403);
  }
}
