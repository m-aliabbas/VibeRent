import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.includes("/absolute/path/to")) {
    return path.join(process.cwd(), ".data", "viberent.db");
  }
  return path.isAbsolute(url) ? url : path.join(process.cwd(), url);
}

const databasePath = resolveDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
export const db = drizzle(sqlite, { schema });
