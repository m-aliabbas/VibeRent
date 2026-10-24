import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "viberent-migration-upgrade-"));
const migrations = path.join(root, "drizzle");
const previousReleaseLastMigration = 22;
const publishedMigrationHashes = {
  "0020_absurd_leper_queen.sql": "1310883e4a6948592c1b646ca8d5a6873579fb7d938920f63e192985a389de16",
  "0021_bright_madame_masque.sql": "1f8dfa5451806e0df56aa0f4dbd00dd97725f39295771ab9a55a137555a24341",
  "0022_salty_wallflower.sql": "d8c1e482e82d8eeffca95b262b9282c0526c90188bc06ef53397d9982399c728",
};

function runMigration(databasePath, migrationsFolder, backupRoot) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/migrate-safe.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databasePath, VIBERENT_MIGRATIONS_DIR: migrationsFolder, BACKUP_ROOT: backupRoot },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function runDesktopStartup(databasePath, backupRoot) {
  const dataRoot = path.dirname(databasePath);
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "--input-type=module", "-e",
    "import { prepareDesktopRuntime } from './src/server/desktop/startup.ts'; await prepareDesktopRuntime(); process.exit(0);",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VIBERENT_DESKTOP: "1",
      LICENSE_ENFORCEMENT: "false",
      VIBERENT_DATA_DIR: dataRoot,
      DATABASE_URL: databasePath,
      PRIVATE_FILE_STORAGE_ROOT: path.join(dataRoot, "private-files"),
      BACKUP_ROOT: backupRoot,
      VIBERENT_MIGRATIONS_DIR: migrations,
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function inspect(databasePath, expectedCount) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get().count, expectedCount);
    return sqlite.prepare("SELECT name FROM agencies WHERE id = 'upgrade_fixture'").get()?.name;
  } finally {
    sqlite.close();
  }
}

try {
  for (const [filename, expectedHash] of Object.entries(publishedMigrationHashes)) {
    const hash = createHash("sha256").update(readFileSync(path.join(migrations, filename))).digest("hex");
    assert.equal(hash, expectedHash, `Published 1.0.18 migration changed: ${filename}`);
  }
  const journal = JSON.parse(readFileSync(path.join(migrations, "meta/_journal.json"), "utf8"));
  assert.equal(journal.entries[previousReleaseLastMigration].tag, "0022_salty_wallflower");
  assert.ok(journal.entries.length > previousReleaseLastMigration + 1, "No release migration is pending.");

  const oldMigrations = path.join(temporaryRoot, "v1.0.18-migrations");
  cpSync(migrations, oldMigrations, { recursive: true });
  for (const entry of journal.entries.slice(previousReleaseLastMigration + 1)) {
    rmSync(path.join(oldMigrations, `${entry.tag}.sql`));
  }
  journal.entries = journal.entries.slice(0, previousReleaseLastMigration + 1);
  writeFileSync(path.join(oldMigrations, "meta/_journal.json"), `${JSON.stringify(journal, null, 2)}\n`);

  const databasePath = path.join(temporaryRoot, "client", "viberent.db");
  const backupRoot = path.join(temporaryRoot, "backups");
  runMigration(databasePath, oldMigrations, backupRoot);
  const sqlite = new Database(databasePath);
  try {
    sqlite.prepare("INSERT INTO agencies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("upgrade_fixture", "Existing Lahore Rentals", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  } finally {
    sqlite.close();
  }
  assert.equal(inspect(databasePath, journal.entries.length), "Existing Lahore Rentals");

  const upgradeOutput = runDesktopStartup(databasePath, backupRoot);
  assert.match(upgradeOutput, /desktop\.migration\.backup_created/);
  const currentCount = JSON.parse(readFileSync(path.join(migrations, "meta/_journal.json"), "utf8")).entries.length;
  assert.equal(inspect(databasePath, currentCount), "Existing Lahore Rentals");
  assert.equal(readdirSync(path.join(backupRoot, "manual")).filter(name => name.includes("pre-migration") && name.endsWith(".viberent-backup.tgz")).length, 1);
  assert.doesNotMatch(runDesktopStartup(databasePath, backupRoot), /desktop\.migration\.backup_created/);
  assert.equal(inspect(databasePath, currentCount), "Existing Lahore Rentals");

  const freshDatabase = path.join(temporaryRoot, "fresh", "viberent.db");
  runMigration(freshDatabase, migrations, path.join(temporaryRoot, "fresh-backups"));
  inspect(freshDatabase, currentCount);
  console.log(`SQLite release migration passed: 1.0.18 upgrade, ${currentCount} total migrations, backup, data preservation, repeat run, fresh install.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
