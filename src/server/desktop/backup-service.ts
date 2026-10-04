import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import * as tar from "tar";
import {
  getBackupRoot,
  getDatabasePath,
  getPendingRestoreDirectory,
  getPrivateFileRoot,
} from "@/server/desktop/runtime-paths";
import { DomainError } from "@/server/domain/errors";

const BACKUP_SUFFIX = ".viberent-backup.tgz";
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const databasePath = getDatabasePath();

type BackupKind = "manual" | "automatic" | "pre-restore";

type BackupManifest = {
  schemaVersion: 1;
  application: "VibeRent";
  createdAt: string;
  kind: BackupKind;
  databaseFile: "database.sqlite";
  databaseSha256: string;
  includesPrivateFiles: boolean;
};

class BackupValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION_FAILED", message, 400);
    this.name = "BackupValidationError";
  }
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function backupDirectory(kind: BackupKind) {
  return path.join(getBackupRoot(), kind === "automatic" ? "automatic" : "manual");
}

export async function createBackup(kind: BackupKind = "manual") {
  const destinationDirectory = backupDirectory(kind);
  await mkdir(destinationDirectory, { recursive: true });
  const staging = await mkdtemp(path.join(os.tmpdir(), "viberent-backup-"));
  const snapshotPath = path.join(staging, "database.sqlite");
  const privateFiles = getPrivateFileRoot();
  const filename = `viberent_${kind}_${timestamp()}${BACKUP_SUFFIX}`;
  const temporaryArchive = path.join(destinationDirectory, `${filename}.${randomUUID()}.tmp`);
  const finalArchive = path.join(destinationDirectory, filename);

  try {
    const { sqlite } = await import("@/db/connection");
    await sqlite.backup(snapshotPath);
    const database = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = database.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") throw new Error("The SQLite snapshot failed its integrity check.");
    } finally {
      database.close();
    }

    let includesPrivateFiles = false;
    try {
      if ((await stat(privateFiles)).isDirectory()) {
        await cp(privateFiles, path.join(staging, "private-files"), { recursive: true });
        includesPrivateFiles = true;
      }
    } catch {}

    const manifest: BackupManifest = {
      schemaVersion: 1,
      application: "VibeRent",
      createdAt: new Date().toISOString(),
      kind,
      databaseFile: "database.sqlite",
      databaseSha256: await sha256(snapshotPath),
      includesPrivateFiles,
    };
    await writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));
    const entries = ["manifest.json", "database.sqlite"];
    if (includesPrivateFiles) entries.push("private-files");
    await tar.c({ cwd: staging, file: temporaryArchive, gzip: true, portable: true }, entries);
    await rename(temporaryArchive, finalArchive);
    const details = await stat(finalArchive);
    return { filename, path: finalArchive, size: details.size, createdAt: manifest.createdAt, kind };
  } finally {
    await rm(temporaryArchive, { force: true });
    await rm(staging, { recursive: true, force: true });
  }
}

export async function listLocalBackups() {
  const items: Array<{ filename: string; path: string; size: number; createdAt: string; kind: BackupKind }> = [];
  for (const kind of ["manual", "automatic"] as const) {
    const directory = backupDirectory(kind);
    await mkdir(directory, { recursive: true });
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(BACKUP_SUFFIX)) continue;
      const filePath = path.join(directory, entry.name);
      const details = await stat(filePath);
      items.push({ filename: entry.name, path: filePath, size: details.size, createdAt: details.mtime.toISOString(), kind });
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBackupOverview() {
  const database = await stat(databasePath).catch(() => null);
  const backups = await listLocalBackups();
  return {
    databasePath: path.basename(databasePath),
    databaseSize: database?.size || 0,
    backupSuffix: BACKUP_SUFFIX,
    backups: backups.map(item => ({
      filename: item.filename,
      size: item.size,
      createdAt: item.createdAt,
      kind: item.kind,
    })),
  };
}

export async function resolveLocalBackup(filename: string) {
  if (path.basename(filename) !== filename || !filename.endsWith(BACKUP_SUFFIX)) return null;
  const backups = await listLocalBackups();
  return backups.find(item => item.filename === filename)?.path ?? null;
}

async function inspectArchive(archivePath: string) {
  const archive = await stat(archivePath);
  if (!archive.isFile() || archive.size <= 0 || archive.size > MAX_BACKUP_BYTES) {
    throw new BackupValidationError("The selected backup has an invalid size.");
  }
  const names = new Set<string>();
  let expandedBytes = 0;
  await tar.t({
    file: archivePath,
    onReadEntry(entry) {
      const normalized = path.posix.normalize(entry.path);
      if (
        normalized.startsWith("../")
        || path.posix.isAbsolute(normalized)
        || names.has(normalized)
        || !["File", "Directory"].includes(entry.type)
      ) throw new BackupValidationError("The backup archive contains an unsafe entry.");
      names.add(normalized);
      expandedBytes += entry.size || 0;
      if (expandedBytes > MAX_EXTRACTED_BYTES) throw new BackupValidationError("The backup expands beyond the allowed size.");
      entry.resume();
    },
  });
  if (!names.has("manifest.json") || !names.has("database.sqlite")) {
    throw new BackupValidationError("The backup is missing its manifest or database snapshot.");
  }
}

async function validateExtractedBackup(directory: string) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as BackupManifest;
  if (
    manifest.schemaVersion !== 1
    || manifest.application !== "VibeRent"
    || manifest.databaseFile !== "database.sqlite"
  ) throw new BackupValidationError("This is not a supported VibeRent backup.");

  const snapshotPath = path.join(directory, manifest.databaseFile);
  if (await sha256(snapshotPath) !== manifest.databaseSha256) {
    throw new BackupValidationError("The backup database checksum does not match its manifest.");
  }
  const database = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new BackupValidationError("The backup database failed its SQLite integrity check.");
    }
    const tables = new Set(
      (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name),
    );
    for (const required of ["agencies", "vehicles", "bookings"]) {
      if (!tables.has(required)) throw new BackupValidationError(`The backup database is missing the ${required} table.`);
    }
  } finally {
    database.close();
  }
  return manifest;
}

export async function stageRestore(
  archivePath: string,
  sourceFilename: string,
  actor?: { agencyId: string; userId: string },
) {
  await inspectArchive(archivePath);
  const extracted = await mkdtemp(path.join(os.tmpdir(), "viberent-restore-"));
  try {
    await tar.x({ cwd: extracted, file: archivePath, strict: true, preservePaths: false });
    const manifest = await validateExtractedBackup(extracted);
    const safetyBackup = await createBackup("pre-restore");
    const pending = getPendingRestoreDirectory();
    await rm(pending, { recursive: true, force: true });
    await mkdir(path.dirname(pending), { recursive: true });
    await writeFile(path.join(extracted, "restore.json"), JSON.stringify({
      sourceFilename: path.basename(sourceFilename),
      stagedAt: new Date().toISOString(),
      safetyBackup: safetyBackup.filename,
      actor,
      manifest,
    }, null, 2));
    await rename(extracted, pending);
    return { sourceFilename: path.basename(sourceFilename), safetyBackup: safetyBackup.filename, restartRequired: true };
  } catch (error) {
    await rm(extracted, { recursive: true, force: true });
    throw error;
  }
}

export async function applyPendingRestore() {
  const pending = getPendingRestoreDirectory();
  try { await stat(path.join(pending, "restore.json")); } catch { return null; }
  await validateExtractedBackup(pending);

  await mkdir(path.dirname(databasePath), { recursive: true });
  const oldDatabase = `${databasePath}.before-restore`;
  const incomingDatabase = `${databasePath}.incoming`;
  const privateRoot = getPrivateFileRoot();
  const oldPrivateRoot = `${privateRoot}.before-restore`;
  const incomingPrivateRoot = `${privateRoot}.incoming`;

  await rm(oldDatabase, { force: true });
  await rm(incomingDatabase, { force: true });
  await rm(oldPrivateRoot, { recursive: true, force: true });
  await rm(incomingPrivateRoot, { recursive: true, force: true });
  await cp(path.join(pending, "database.sqlite"), incomingDatabase);
  const pendingFiles = path.join(pending, "private-files");
  await cp(pendingFiles, incomingPrivateRoot, { recursive: true }).catch(async () => {
    await mkdir(incomingPrivateRoot, { recursive: true });
  });

  let databaseMoved = false;
  let filesMoved = false;
  try {
    await rename(databasePath, oldDatabase).then(() => { databaseMoved = true; }).catch(() => undefined);
    await rename(incomingDatabase, databasePath);
    await rename(privateRoot, oldPrivateRoot).then(() => { filesMoved = true; }).catch(() => undefined);
    await rename(incomingPrivateRoot, privateRoot);
    await rm(`${databasePath}-wal`, { force: true });
    await rm(`${databasePath}-shm`, { force: true });
  } catch (error) {
    await rm(databasePath, { force: true });
    if (databaseMoved) await rename(oldDatabase, databasePath).catch(() => undefined);
    await rm(privateRoot, { recursive: true, force: true });
    if (filesMoved) await rename(oldPrivateRoot, privateRoot).catch(() => undefined);
    throw error;
  }

  await rm(oldDatabase, { force: true });
  await rm(oldPrivateRoot, { recursive: true, force: true });
  const result = JSON.parse(await readFile(path.join(pending, "restore.json"), "utf8")) as {
    sourceFilename: string;
    safetyBackup?: string;
    actor?: { agencyId: string; userId: string };
  };
  await rm(pending, { recursive: true, force: true });
  return result;
}

export async function cleanupAutomaticBackups(daysToKeep: number) {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  for (const backup of await listLocalBackups()) {
    if (backup.kind === "automatic" && new Date(backup.createdAt).getTime() < cutoff) {
      await rm(backup.path, { force: true });
    }
  }
}
