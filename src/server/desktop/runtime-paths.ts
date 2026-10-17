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
  const legacySqlitePath = process.env.DATABASE_URL?.trim().toLowerCase().startsWith("postgres")
    ? undefined
    : process.env.DATABASE_URL;
  return resolveFromProcess(process.env.SQLITE_DATABASE_PATH ?? legacySqlitePath, path.join(getDataDirectory(), "viberent.db"));
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

export function getWhatsAppDatabasePath() {
  return resolveFromProcess(
    process.env.WHATSAPP_DATABASE_PATH,
    path.join(getDataDirectory(), "whatsapp.db"),
  );
}

export function getWhatsAppImageInboxPath() {
  return resolveFromProcess(
    process.env.WHATSAPP_IMAGE_INBOX_PATH,
    path.join(getDataDirectory(), "whatsapp-images"),
  );
}

export function getPendingRestoreDirectory() {
  return path.join(getDataDirectory(), "pending-restore");
}

export function isDesktopRuntime() {
  return process.env.VIBERENT_DESKTOP === "1";
}
