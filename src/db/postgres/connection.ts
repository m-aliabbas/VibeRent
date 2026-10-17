import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import { requirePostgresUrl } from "@/db/database-target";
import * as schema from "@/db/postgres/schema";

const globalForPostgres = globalThis as typeof globalThis & {
  viberentPostgresPool?: Pool;
};

// VibeRent stores money in integer PKR units and operational counts remain
// within JavaScript's safe integer range.
types.setTypeParser(20, value => Number(value));
types.setTypeParser(1700, value => Number(value));

export const postgresPool =
  globalForPostgres.viberentPostgresPool ??
  new Pool({
    connectionString: requirePostgresUrl(),
    max: Number(process.env.POSTGRES_POOL_MAX || 10),
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 10_000),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000),
    ssl: process.env.POSTGRES_SSL === "disable" ? false : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.viberentPostgresPool = postgresPool;
}

export const postgresDb = drizzle(postgresPool, { schema });
