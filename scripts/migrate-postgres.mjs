import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url || !/^postgres(?:ql)?:\/\//i.test(url)) {
  throw new Error("Set POSTGRES_URL to run PostgreSQL migrations.");
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle-postgres" });
  console.log("PostgreSQL migrations applied.");
} finally {
  await pool.end();
}
