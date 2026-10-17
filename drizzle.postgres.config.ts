import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const url = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!url || !/^postgres(?:ql)?:\/\//i.test(url)) {
  throw new Error("Set POSTGRES_URL to generate or run PostgreSQL migrations.");
}

export default defineConfig({
  schema: "./src/db/postgres/schema.ts",
  out: "./drizzle-postgres",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
