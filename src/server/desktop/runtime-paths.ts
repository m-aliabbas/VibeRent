import path from "node:path";

function resolveFromProcess(value: string | undefined, fallback: string) {
  const configured = value?.trim();
  const selected = configured || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(process.cwd(), selected);
}

export function getDataDirectory() {
  return resolveFromProcess(process.env.VIBERENT_DATA_DIR, ".data");
}

export function getDatabasePath() {
  return resolveFromProcess(process.env.DATABASE_URL, path.join(getDataDirectory(), "viberent.db"));
}

export function getPrivateFileRoot() {
  return resolveFromProcess(
    process.env.PRIVATE_FILE_STORAGE_ROOT,
    path.join(getDataDirectory(), "private-files"),
  );
}

export function getBackupRoot() {
  return resolveFromProcess(process.env.BACKUP_ROOT, path.join(getDataDirectory(), "backups"));
}

export function getLicenseStatusPath() {
  return path.join(getDataDirectory(), "license-status.json");
}

export function getLicenseCachePath() {
  return resolveFromProcess(
    process.env.LICENSE_CACHE_PATH,
    path.join(getDataDirectory(), "license-cache.enc"),
  );
}

export function getGoogleDriveSessionPath() {
  return resolveFromProcess(
    process.env.GOOGLE_DRIVE_SESSION_PATH,
    path.join(getDataDirectory(), "google-drive-session.enc"),
  );
}

export function getPendingRestoreDirectory() {
  return path.join(getDataDirectory(), "pending-restore");
}

export function isDesktopRuntime() {
  return process.env.VIBERENT_DESKTOP === "1";
}
