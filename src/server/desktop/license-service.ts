import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cert, getApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { DomainError } from "@/server/domain/errors";
import { loadFirebaseCredentials } from "@/server/desktop/encrypted-credentials";
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
};

type FirestoreTimestamp = { toDate(): Date };

let refreshPromise: Promise<DesktopLicenseStatus> | null = null;
let currentStatus: DesktopLicenseStatus | null = null;

function readMachineIdentifier() {
  if (process.platform === "win32") {
    const result = spawnSync("reg", [
      "query",
      String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`,
      "/v",
      "MachineGuid",
    ], { encoding: "utf8", windowsHide: true });
    const match = result.stdout?.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const value = readFileSync(candidate, "utf8").trim();
      if (value) return value;
    } catch {}
  }
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && !item.internal && item.mac !== "00:00:00:00:00:00")
    .map(item => item!.mac)
    .sort();
  return `${os.hostname()}|${os.platform()}|${os.arch()}|${macs.join(",")}`;
}

export function getDeviceFingerprint() {
  return createHash("sha256")
    .update(`${process.env.LICENSE_APPLICATION_ID || "viberent"}|${readMachineIdentifier()}`)
    .digest("hex");
}

function parseExpiry(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as FirestoreTimestamp).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

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

async function loadCachedStatus(fingerprint: string) {
  const status = await readEncryptedJson<DesktopLicenseStatus>(getLicenseCachePath());
  if (!status || !statusIsActive(status, fingerprint)) return null;
  return {
    ...status,
    checkedAt: new Date().toISOString(),
    message: "License verified from the encrypted offline cache.",
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
      }, { merge: true });
    }
    return {
      enforced: true,
      state: "pending",
      fingerprint,
      message: "Device registered and waiting for administrator approval.",
      checkedAt: new Date().toISOString(),
    };
  }

  const license = snapshot.data() || {};
  await reference.set({
    lastSeenAt: FieldValue.serverTimestamp(),
    appVersion: (process.env.VIBERENT_VERSION || "0.0.0").slice(0, 32),
  }, { merge: true });
  if (license.disabled === true) {
    return { enforced: true, state: "revoked", fingerprint, message: "This device license has been revoked.", checkedAt: new Date().toISOString() };
  }
  if (license.approved !== true) {
    return { enforced: true, state: "pending", fingerprint, message: "This device is waiting for administrator approval.", checkedAt: new Date().toISOString() };
  }

  const expiresAt = parseExpiry(license.expireDate ?? license.expire_date);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return { enforced: true, state: "expired", fingerprint, message: "This device license has expired.", checkedAt: new Date().toISOString() };
  }

  const offlineUntil = new Date(Math.min(
    expiresAt.getTime(),
    Date.now() + OFFLINE_LICENSE_DAYS * 24 * 60 * 60 * 1000,
  ));
  const status: DesktopLicenseStatus = {
    enforced: true,
    state: "active",
    fingerprint,
    message: "License verified with Firebase.",
    checkedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    offlineUntil: offlineUntil.toISOString(),
  };
  await writeEncryptedJson(getLicenseCachePath(), status);
  return status;
}

async function refreshLicenseStatusInternal(): Promise<DesktopLicenseStatus> {
  const fingerprint = getDeviceFingerprint();
  if (!isDesktopRuntime() || process.env.LICENSE_ENFORCEMENT !== "true") {
    return writeStatus({
      enforced: false,
      state: "disabled",
      fingerprint,
      message: "Desktop license enforcement is disabled for this runtime.",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    return writeStatus(await checkOnlineLicense(fingerprint));
  } catch {
    const cached = await loadCachedStatus(fingerprint);
    if (cached) return writeStatus(cached);
    return writeStatus({
      enforced: true,
      state: "misconfigured",
      fingerprint,
      message: "Firebase credentials are unavailable or the license service could not be reached.",
      checkedAt: new Date().toISOString(),
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
  let status = currentStatus;
  if (!status) {
    try {
      status = JSON.parse(readFileSync(getLicenseStatusPath(), "utf8")) as DesktopLicenseStatus;
    } catch {}
  }
  if (status && (!enforced || statusIsActive(status, fingerprint) || status.state !== "active")) {
    return status;
  }
  return {
    enforced,
    state: enforced ? "unavailable" : "disabled",
    fingerprint,
    message: enforced ? "License verification has not completed." : "Desktop license enforcement is disabled.",
    checkedAt: new Date().toISOString(),
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
