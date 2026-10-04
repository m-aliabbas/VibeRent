import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

export type DeviceFingerprintPayload = {
  system: string;
  node: string;
  release: string;
  version: string;
  machine: string;
  processor: string;
  mac: number;
  os_user: string;
};

function externalMacAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && !item.internal && item.mac !== "00:00:00:00:00:00")
    .map(item => item!.mac.toLowerCase())
    .sort();
}

function numericMac(addresses: string[]) {
  const compact = addresses[0]?.replaceAll(":", "").replaceAll("-", "") ?? "";
  if (!/^[a-f0-9]{12}$/i.test(compact)) return 0;
  return Number.parseInt(compact, 16);
}

function operatingSystemName() {
  if (process.platform === "win32") return "Windows";
  if (process.platform === "darwin") return "Darwin";
  if (process.platform === "linux") return "Linux";
  return os.type();
}

function currentUser() {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER || process.env.USERNAME || "";
  }
}

export function getDeviceFingerprintPayload(): DeviceFingerprintPayload {
  const addresses = externalMacAddresses();
  return {
    system: operatingSystemName(),
    node: os.hostname(),
    release: os.release(),
    version: os.version(),
    machine: typeof os.machine === "function" ? os.machine() : os.arch(),
    processor: os.cpus()[0]?.model ?? "",
    mac: numericMac(addresses),
    os_user: currentUser(),
  };
}

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
  const payload = getDeviceFingerprintPayload();
  return `${payload.node}|${os.platform()}|${os.arch()}|${externalMacAddresses().join(",")}`;
}

export function getDeviceFingerprint(applicationId = process.env.LICENSE_APPLICATION_ID || "viberent") {
  return createHash("sha256")
    .update(`${applicationId}|${readMachineIdentifier()}`)
    .digest("hex");
}
