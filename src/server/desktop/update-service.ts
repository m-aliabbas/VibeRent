import "server-only";

import packageJson from "../../../package.json";
import { compareReleaseVersions, isReleaseVersion, type SoftwareUpdateStatus } from "@/lib/software-update";
import { DomainError } from "@/server/domain/errors";

const releaseRepository = "m-aliabbas/viberent-releases";
const defaultManifestUrl = `https://github.com/${releaseRepository}/releases/latest/download/latest.json`;
const downloadPrefix = `https://github.com/${releaseRepository}/releases/download/`;

type ReleaseManifest = {
  schema_version: number;
  version: string;
  published_at: string;
  notes: string;
  release_url: string;
  downloads: Record<string, { url: string; sha256: string; size: number }>;
};

function validHttpsUrl(value: unknown, requiredPrefix: string): value is string {
  if (typeof value !== "string" || !value.startsWith(requiredPrefix)) return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  if (!value || typeof value !== "object") throw new Error("The release manifest is not an object.");
  const manifest = value as Partial<ReleaseManifest>;
  const download = manifest.downloads?.["windows-x86_64"];
  if (
    manifest.schema_version !== 1
    || typeof manifest.version !== "string"
    || !isReleaseVersion(manifest.version)
    || typeof manifest.published_at !== "string"
    || !Number.isFinite(Date.parse(manifest.published_at))
    || typeof manifest.notes !== "string"
    || !validHttpsUrl(manifest.release_url, `https://github.com/${releaseRepository}/releases/tag/`)
    || !download
    || !validHttpsUrl(download.url, downloadPrefix)
    || typeof download.sha256 !== "string"
    || !/^[a-f0-9]{64}$/i.test(download.sha256)
    || !Number.isSafeInteger(download.size)
    || download.size <= 0
    || download.size > 1024 * 1024 * 1024
  ) {
    throw new Error("The release manifest is invalid.");
  }
  return manifest as ReleaseManifest;
}

export async function checkForSoftwareUpdate(): Promise<SoftwareUpdateStatus> {
  const currentVersion = process.env.VIBERENT_VERSION?.trim() || packageJson.version;
  const manifestUrl = process.env.VIBERENT_UPDATE_MANIFEST_URL?.trim() || defaultManifestUrl;
  try {
    const response = await fetch(manifestUrl, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": `VibeRent/${currentVersion}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const manifest = parseReleaseManifest(await response.json());
    const download = manifest.downloads["windows-x86_64"];
    return {
      currentVersion,
      latestVersion: manifest.version,
      updateAvailable: compareReleaseVersions(manifest.version, currentVersion) > 0,
      publishedAt: manifest.published_at,
      notes: manifest.notes,
      releaseUrl: manifest.release_url,
      download: {
        ...download,
        sha256: download.sha256.toLowerCase(),
        fileName: new URL(download.url).pathname.split("/").at(-1) || `VibeRent_${manifest.version}_x64-setup.exe`,
      },
      checkedAt: new Date().toISOString(),
    };
  } catch (cause) {
    console.error(JSON.stringify({ operation: "desktop.update_check", message: cause instanceof Error ? cause.message : "Unknown error" }));
    throw new DomainError("INTERNAL_ERROR", "VibeRent could not check GitHub for updates. Check your internet connection and try again.", 502);
  }
}
