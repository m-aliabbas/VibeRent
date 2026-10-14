import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const databasePath = path.resolve(process.cwd(), process.env.DATABASE_URL?.trim() || ".data/viberent.db");
const migrationsFolder = path.resolve(process.cwd(), process.env.VIBERENT_MIGRATIONS_DIR?.trim() || "drizzle");
const backupRoot = path.resolve(
  process.cwd(),
  process.env.BACKUP_ROOT?.trim() || path.join(path.dirname(databasePath), "backups"),
);
const migrationBackupDirectory = path.join(backupRoot, "migrations");

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function tableExists(sqlite, name) {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1").get("table", name),
  );
}

function lastAppliedMigration(sqlite) {
  if (!tableExists(sqlite, "__drizzle_migrations")) return null;
  const row = sqlite
    .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
    .get();
  return row ? Number(row.created_at) : null;
}

function assertHealthy(sqlite, label) {
  const result = sqlite.pragma("integrity_check", { simple: true });
  if (result !== "ok") throw new Error(`${label} failed its SQLite integrity check.`);
}

function assertForeignKeys(sqlite) {
  const violations = sqlite.pragma("foreign_key_check");
  if (violations.length > 0) {
    throw new Error(`Migrated database has ${violations.length} foreign-key violation(s).`);
  }
}

function hasClientData(sqlite) {
  return Boolean(
    sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' LIMIT 1",
      )
      .get(),
  );
}

async function createMigrationBackup(sqlite) {
  await mkdir(migrationBackupDirectory, { recursive: true });
  const destination = path.join(migrationBackupDirectory, `viberent-before-migration-${timestamp()}.db`);
  await sqlite.backup(destination);

  const snapshot = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    assertHealthy(snapshot, "Migration backup");
  } finally {
    snapshot.close();
  }
  return destination;
}

await mkdir(path.dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

try {
  assertHealthy(sqlite, "Database");
  const migrations = readMigrationFiles({ migrationsFolder });
  const lastAppliedAt = lastAppliedMigration(sqlite);
  const pending = migrations.filter(migration => lastAppliedAt === null || lastAppliedAt < migration.folderMillis);

  if (pending.length === 0) {
    process.stdout.write(`Database ready: ${migrations.length} migrations applied; client data unchanged.\n`);
  } else {
    const backupPath = hasClientData(sqlite) ? await createMigrationBackup(sqlite) : null;
    sqlite.pragma("foreign_keys = OFF");
    try {
      migrate(drizzle(sqlite), { migrationsFolder });
    } finally {
      sqlite.pragma("foreign_keys = ON");
    }
    assertHealthy(sqlite, "Migrated database");
    assertForeignKeys(sqlite);

    const remaining = migrations.filter(
      migration => (lastAppliedMigration(sqlite) ?? Number.NEGATIVE_INFINITY) < migration.folderMillis,
    );
    if (remaining.length > 0) throw new Error(`${remaining.length} database migration(s) are still pending.`);

    process.stdout.write(`Database ready: applied ${pending.length} pending migration(s) without resetting client data.\n`);
    if (backupPath) process.stdout.write(`Safety backup: ${backupPath}\n`);
  }
} finally {
  sqlite.close();
}
