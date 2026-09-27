import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url:
      !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("/absolute/path/to")
        ? ".data/viberent.db"
        : process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
