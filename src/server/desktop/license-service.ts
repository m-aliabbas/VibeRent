import "server-only";

import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DomainError } from "@/server/domain/errors";
import {
  getLicenseCachePath,
  getLicenseStatusPath,
  isDesktopRuntime,
} from "@/server/desktop/runtime-paths";

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

type LicenseClaims = {
  sub: string;
  aud: string;
  applicationId: string;
  approved: boolean;
  exp: number;
  iat?: number;
  customerName?: string;
};

let refreshPromise: Promise<DesktopLicenseStatus> | null = null;

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

function decodePart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function verifyToken(token: string): LicenseClaims {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) {
    throw new Error("The license token is malformed.");
  }
  const header = decodePart<{ alg?: string }>(encodedHeader);
  if (header.alg !== "RS256") throw new Error("The license token algorithm is not allowed.");

  const encodedKey = process.env.LICENSE_PUBLIC_KEY_BASE64?.trim();
  if (!encodedKey) throw new Error("The license public key is not configured.");
  const publicKey = createPublicKey(Buffer.from(encodedKey, "base64").toString("utf8"));
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!valid) throw new Error("The license signature is invalid.");

  const claims = decodePart<LicenseClaims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  if (claims.sub !== getDeviceFingerprint()) throw new Error("The license belongs to another device.");
  if (claims.aud !== (process.env.LICENSE_AUDIENCE || "viberent-desktop")) throw new Error("The license audience is invalid.");
  if (claims.applicationId !== (process.env.LICENSE_APPLICATION_ID || "viberent")) throw new Error("The license is for another application.");
  if (!claims.approved) throw new Error("The license is not approved.");
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error("The license has expired.");
  return claims;
}

async function writeStatus(status: DesktopLicenseStatus) {
  const statusPath = getLicenseStatusPath();
  await mkdir(path.dirname(statusPath), { recursive: true });
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(status, null, 2), { mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(temporaryPath, statusPath);
  return status;
}

function activeStatus(claims: LicenseClaims, source: "online" | "offline"): DesktopLicenseStatus {
  const expiresAt = new Date(claims.exp * 1000).toISOString();
  return {
    enforced: true,
    state: "active",
    fingerprint: claims.sub,
    message: source === "online" ? "License verified online." : "License verified from the signed offline cache.",
    checkedAt: new Date().toISOString(),
    expiresAt,
    offlineUntil: expiresAt,
  };
}

async function loadCachedToken() {
  try {
    const cache = JSON.parse(await readFile(getLicenseCachePath(), "utf8")) as { token?: string };
    if (!cache.token) return null;
    return activeStatus(verifyToken(cache.token), "offline");
  } catch {
    return null;
  }
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

  const endpoint = process.env.LICENSE_ENDPOINT_URL?.trim();
  if (!endpoint || !process.env.LICENSE_PUBLIC_KEY_BASE64?.trim()) {
    return writeStatus({
      enforced: true,
      state: "misconfigured",
      fingerprint,
      message: "The desktop license endpoint or public key is not configured.",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fingerprint,
        applicationId: process.env.LICENSE_APPLICATION_ID || "viberent",
        version: process.env.VIBERENT_VERSION || "0.0.0",
        requestId: randomUUID(),
      }),
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    const payload = await response.json().catch(() => ({})) as { token?: string; state?: LicenseState; message?: string };
    if (response.ok && payload.token) {
      const claims = verifyToken(payload.token);
      const cachePath = getLicenseCachePath();
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify({ token: payload.token }), { mode: 0o600 });
      return writeStatus(activeStatus(claims, "online"));
    }
    const state: LicenseState = ["pending", "expired", "revoked"].includes(payload.state || "")
      ? payload.state as LicenseState
      : "unavailable";
    return writeStatus({
      enforced: true,
      state,
      fingerprint,
      message: payload.message || "This device does not have an active VibeRent license.",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    const cached = await loadCachedToken();
    if (cached) return writeStatus(cached);
    return writeStatus({
      enforced: true,
      state: "unavailable",
      fingerprint,
      message: "The license service is unavailable and no valid offline license is cached.",
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
  try {
    const status = JSON.parse(readFileSync(getLicenseStatusPath(), "utf8")) as DesktopLicenseStatus;
    if (enforced && status.state === "active") {
      try {
        const cache = JSON.parse(readFileSync(getLicenseCachePath(), "utf8")) as { token?: string };
        if (!cache.token) throw new Error("Signed license cache is missing.");
        const claims = verifyToken(cache.token);
        return { ...status, expiresAt: new Date(claims.exp * 1000).toISOString(), offlineUntil: new Date(claims.exp * 1000).toISOString() };
      } catch {
        return {
          enforced: true,
          state: "expired",
          fingerprint: getDeviceFingerprint(),
          message: "The signed offline license is missing, invalid, or expired.",
          checkedAt: new Date().toISOString(),
        };
      }
    }
    return status;
  } catch {
    return {
      enforced,
      state: enforced ? "unavailable" : "disabled",
      fingerprint: getDeviceFingerprint(),
      message: enforced ? "License verification has not completed." : "Desktop license enforcement is disabled.",
      checkedAt: new Date().toISOString(),
    };
  }
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
