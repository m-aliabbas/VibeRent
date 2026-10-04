import "server-only";

import { createBackup, cleanupAutomaticBackups } from "@/server/desktop/backup-service";
import { getGoogleDriveStatus, uploadBackupToGoogleDrive } from "@/server/desktop/google-drive-service";

type SchedulerState = {
  timer?: NodeJS.Timeout;
  running: boolean;
  nextRun?: string;
  lastRun?: string;
  lastSuccess?: string;
  lastError?: string;
};

const schedulerGlobal = globalThis as typeof globalThis & { __viberentBackupScheduler?: SchedulerState };
const schedulerState = schedulerGlobal.__viberentBackupScheduler ??= { running: false };

function configuredHour() {
  const value = Number(process.env.BACKUP_HOUR ?? 12);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 12;
}

function retentionDays() {
  const value = Number(process.env.BACKUP_RETENTION_DAYS ?? 7);
  return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 7;
}

function nextBackupTime() {
  const next = new Date();
  next.setHours(configuredHour(), 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next;
}

async function runAutomaticBackup() {
  schedulerState.lastRun = new Date().toISOString();
  schedulerState.lastError = undefined;
  try {
    const backup = await createBackup("automatic");
    await cleanupAutomaticBackups(retentionDays());
    if ((await getGoogleDriveStatus()).connected) {
      await uploadBackupToGoogleDrive(backup.path);
    }
    schedulerState.lastSuccess = new Date().toISOString();
  } catch (error) {
    schedulerState.lastError = error instanceof Error ? error.message : "Automatic backup failed.";
    console.error(JSON.stringify({ event: "desktop.backup.failed", message: schedulerState.lastError }));
  }
}

function scheduleNext() {
  const next = nextBackupTime();
  schedulerState.nextRun = next.toISOString();
  const delay = Math.max(1_000, Math.min(next.getTime() - Date.now(), 2_147_483_647));
  schedulerState.timer = setTimeout(async () => {
    await runAutomaticBackup();
    scheduleNext();
  }, delay);
  schedulerState.timer.unref();
}

export function startBackupScheduler() {
  if (schedulerState.running) return;
  schedulerState.running = true;
  scheduleNext();
}

export function getBackupSchedulerStatus() {
  return {
    running: schedulerState.running,
    nextRun: schedulerState.nextRun ?? null,
    lastRun: schedulerState.lastRun ?? null,
    lastSuccess: schedulerState.lastSuccess ?? null,
    lastError: schedulerState.lastError ?? null,
    hour: configuredHour(),
    retentionDays: retentionDays(),
  };
}

export async function runAutomaticBackupNow() {
  await runAutomaticBackup();
  return getBackupSchedulerStatus();
}
