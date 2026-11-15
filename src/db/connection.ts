import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { getDatabasePath } from "@/server/desktop/runtime-paths";

export const databasePath = getDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

// Dev hot reload re-evaluates this module; reuse one connection so a stale handle
// never holds the write lock and makes saves fail with "database is locked".
const globalForDb = globalThis as unknown as { __viberentSqlite?: Database.Database; __viberentSqlitePath?: string };
function open() {
  const connection = new Database(databasePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
  return connection;
}
export const sqlite = globalForDb.__viberentSqlite && globalForDb.__viberentSqlitePath === databasePath ? globalForDb.__viberentSqlite : open();
if (process.env.NODE_ENV !== "production") { globalForDb.__viberentSqlite = sqlite; globalForDb.__viberentSqlitePath = databasePath; }
export const db = drizzle(sqlite, { schema });
