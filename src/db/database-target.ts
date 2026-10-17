export type DatabaseTarget = "sqlite" | "postgres";

/**
 * Desktop releases are always self-contained and use SQLite. Hosted web
 * deployments use PostgreSQL unless a developer explicitly selects SQLite.
 */
export function getDatabaseTarget(env: NodeJS.ProcessEnv = process.env): DatabaseTarget {
  if (env.VIBERENT_DESKTOP === "1") return "sqlite";

  const configured = env.VIBERENT_DATABASE?.trim().toLowerCase();
  if (!configured) return env.NODE_ENV === "production" ? "postgres" : "sqlite";
  if (configured === "sqlite" || configured === "postgres") return configured;

  throw new Error("VIBERENT_DATABASE must be either 'sqlite' or 'postgres'.");
}

export function requirePostgresUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.POSTGRES_URL?.trim() || env.DATABASE_URL?.trim();
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error(
      "The hosted web build requires POSTGRES_URL (or DATABASE_URL) with a postgresql:// connection string.",
    );
  }
  return value;
}
