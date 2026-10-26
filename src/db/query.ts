import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type Database from "better-sqlite3";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDatabaseTarget } from "@/db/database-target";

export type RunResult = { changes: number };
export type SqlParameters = unknown[] | Record<string, unknown>;

type TransactionStore =
  | { target: "sqlite"; database: Database.Database }
  | { target: "postgres"; client: PoolClient };

const transactions = new AsyncLocalStorage<TransactionStore>();
let sqliteInstance: Database.Database | undefined;
let postgresInstance: Pool | undefined;
let sqliteQueue: Promise<void> = Promise.resolve();

async function sqliteDatabase() {
  if (sqliteInstance) return sqliteInstance;
  const { sqlite } = await import("@/db/connection");
  sqliteInstance = sqlite;
  return sqliteInstance;
}

async function postgresPool() {
  if (postgresInstance) return postgresInstance;
  const { postgresPool } = await import("@/db/postgres/connection");
  postgresInstance = postgresPool;
  return postgresInstance;
}

function postgresSql(source: string) {
  let sql = source
    .replace(/\/\*postgres:for-update\*\//gi, "FOR UPDATE")
    .replace(/\b(FROM|JOIN|INTO|UPDATE)\s+user\b/gi, '$1 "user"')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
    .replace(/\s+COLLATE\s+NOCASE/gi, "")
    .replace(/\bmax\(\s*0\s*,/gi, "greatest(0,")
    .replace(/group_concat\(([^,]+),\s*('[^']*')\)/gi, "string_agg($1, $2)")
    .replace(/lower\(hex\(randomblob\(16\)\)\)/gi, "md5(random()::text || clock_timestamp()::text)")
    .replace(/substr\(hex\(randomblob\(4\)\),\s*1,\s*8\)/gi, "substr(md5(random()::text), 1, 8)")
    .replace(/\bAS\s+([a-z_][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g, 'AS "$1"');

  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(source) && !/\bON\s+CONFLICT\b/i.test(sql)) {
    sql = `${sql.trimEnd().replace(/;$/, "")} ON CONFLICT DO NOTHING`;
  }

  let index = 0;
  let quote: "'" | '"' | null = null;
  let output = "";
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position];
    const next = sql[position + 1];
    if (quote) {
      output += character;
      if (character === quote && next === quote) {
        output += next;
        position += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") {
      index += 1;
      output += `$${index}`;
    } else {
      output += character;
    }
  }
  return output;
}

function normalizeParameters(sql: string, parameters: SqlParameters): { sql: string; parameters: unknown[] } {
  if (Array.isArray(parameters)) return { sql, parameters };

  const values: unknown[] = [];
  const normalizedSql = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(parameters, name)) {
      throw new Error(`Missing SQL parameter: ${name}`);
    }
    values.push(parameters[name]);
    return "?";
  });
  return { sql: normalizedSql, parameters: values };
}

async function withSqliteLock<T>(operation: (database: Database.Database) => T | Promise<T>) {
  const active = transactions.getStore();
  if (active?.target === "sqlite") return operation(active.database);

  let release!: () => void;
  const previous = sqliteQueue;
  sqliteQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await operation(await sqliteDatabase());
  } finally {
    release();
  }
}

/** The client of the active PostgreSQL transaction, so a library (the job queue) can write inside it. */
export function activePostgresTransactionClient(): PoolClient | undefined {
  const active = transactions.getStore();
  return active?.target === "postgres" ? active.client : undefined;
}

async function postgresExecutor() {
  const active = transactions.getStore();
  return active?.target === "postgres" ? active.client : postgresPool();
}

export async function queryAll<T extends QueryResultRow = QueryResultRow>(sql: string, parameters: unknown[] = []): Promise<T[]> {
  if (getDatabaseTarget() === "sqlite") {
    return withSqliteLock(database => database.prepare(sql).all(...parameters) as T[]);
  }
  const executor = await postgresExecutor();
  const result = await executor.query<T>(postgresSql(sql), parameters);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(sql: string, parameters: unknown[] = []): Promise<T | undefined> {
  if (getDatabaseTarget() === "sqlite") {
    return withSqliteLock(database => database.prepare(sql).get(...parameters) as T | undefined);
  }
  const executor = await postgresExecutor();
  const result = await executor.query<T>(postgresSql(sql), parameters);
  return result.rows[0];
}

export async function execute(sql: string, parameters: SqlParameters = []): Promise<RunResult> {
  const normalized = normalizeParameters(sql, parameters);
  if (getDatabaseTarget() === "sqlite") {
    return withSqliteLock(database => {
      const result = database.prepare(normalized.sql).run(...normalized.parameters);
      return { changes: result.changes };
    });
  }
  const executor = await postgresExecutor();
  const result = await executor.query(postgresSql(normalized.sql), normalized.parameters);
  return { changes: result.rowCount ?? 0 };
}

export async function inTransaction<T>(operation: () => T | Promise<T>, options: { immediate?: boolean } = {}): Promise<T> {
  if (transactions.getStore()) return operation();

  if (getDatabaseTarget() === "sqlite") {
    return withSqliteLock(async database => {
      database.exec(options.immediate ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = await transactions.run({ target: "sqlite", database }, operation);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    });
  }

  const pool = await postgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await transactions.run({ target: "postgres", client }, operation);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const database = {
  all: queryAll,
  get: queryOne,
  run: execute,
  transaction: inTransaction,
};
