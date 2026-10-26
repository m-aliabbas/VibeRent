import "server-only";

import fs from "node:fs";
import Database from "better-sqlite3";
import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type SignalDataSet, type SignalDataTypeMap, type WAMessageContent } from "@whiskeysockets/baileys";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import type { WhatsAppAuthStore } from "@/server/whatsapp/auth-store";

function serialize(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}

/** Rows per multi-row statement; keeps parameter counts well under PostgreSQL's limit. */
const writeBatchSize = 200;
/** Sent messages older than this are no longer needed for WhatsApp retry requests. */
export const messageCacheRetentionMs = 7 * 24 * 60 * 60 * 1000;

/** Baileys session storage in PostgreSQL for the web WhatsApp gateway. */
export class PostgresWhatsAppAuthStore implements WhatsAppAuthStore {
  async useSession(sessionId: string) {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) throw new Error("A non-empty WhatsApp session ID is required.");
    const row = await queryOne<{ payload: string }>("SELECT payload FROM whatsapp_auth_credentials WHERE session_id=?", [normalizedSessionId]);
    const creds = row ? deserialize<AuthenticationCreds>(row.payload) : initAuthCreds();

    const saveCreds = async () => {
      await execute(
        `INSERT INTO whatsapp_auth_credentials (session_id,payload,updated_at) VALUES (?,?,?)
         ON CONFLICT (session_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,
        [normalizedSessionId, serialize(creds), new Date().toISOString()],
      );
    };

    const getKeys = async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};
      if (ids.length === 0) return result;
      const rows = await queryAll<{ keyId: string; payload: string }>(
        "SELECT key_id AS keyId,payload FROM whatsapp_auth_keys WHERE session_id=? AND key_type=? AND key_id = ANY(?)",
        [normalizedSessionId, type, ids],
      );
      for (const keyRow of rows) {
        let value = deserialize<SignalDataTypeMap[T]>(keyRow.payload);
        if (type === "app-state-sync-key") {
          value = proto.Message.AppStateSyncKeyData.fromObject(value as proto.Message.IAppStateSyncKeyData) as unknown as SignalDataTypeMap[T];
        }
        result[keyRow.keyId] = value;
      }
      return result;
    };

    const setKeys = async (data: SignalDataSet) => {
      const now = new Date().toISOString();
      const upserts: Array<[string, string, string]> = [];
      const removals = new Map<string, string[]>();
      for (const [type, values] of Object.entries(data)) {
        if (!values) continue;
        for (const [id, value] of Object.entries(values)) {
          if (value == null) removals.set(type, [...(removals.get(type) ?? []), id]);
          else upserts.push([type, id, serialize(value)]);
        }
      }
      await inTransaction(async () => {
        await writeKeys(normalizedSessionId, upserts, now);
        for (const [type, ids] of removals) {
          await execute("DELETE FROM whatsapp_auth_keys WHERE session_id=? AND key_type=? AND key_id = ANY(?)", [normalizedSessionId, type, ids]);
        }
      });
    };

    return {
      state: {
        creds,
        keys: { get: getKeys, set: setKeys, clear: async () => { await execute("DELETE FROM whatsapp_auth_keys WHERE session_id=?", [normalizedSessionId]); } },
      },
      saveCreds,
    };
  }

  async clearSession(sessionId: string) {
    await inTransaction(async () => {
      await execute("DELETE FROM whatsapp_auth_keys WHERE session_id=?", [sessionId]);
      await execute("DELETE FROM whatsapp_message_cache WHERE session_id=?", [sessionId]);
      await execute("DELETE FROM whatsapp_auth_credentials WHERE session_id=?", [sessionId]);
    });
  }

  async hasRegisteredSession(sessionId: string) {
    const row = await queryOne<{ payload: string }>("SELECT payload FROM whatsapp_auth_credentials WHERE session_id=?", [sessionId.trim()]);
    if (!row) return false;
    try { return deserialize<AuthenticationCreds>(row.payload).registered === true; }
    catch { return false; }
  }

  async getMessage(sessionId: string, remoteJid: string, messageId: string) {
    const row = await queryOne<{ payload: string }>(
      `SELECT payload FROM whatsapp_message_cache WHERE session_id=? AND message_id=?
       ORDER BY CASE WHEN remote_jid=? THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
      [sessionId, messageId, remoteJid],
    );
    return row ? deserialize<WAMessageContent>(row.payload) : undefined;
  }

  async saveMessage(sessionId: string, remoteJid: string, messageId: string, message: WAMessageContent) {
    await execute(
      `INSERT INTO whatsapp_message_cache (session_id,remote_jid,message_id,payload,created_at) VALUES (?,?,?,?,?)
       ON CONFLICT (session_id,remote_jid,message_id) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at`,
      [sessionId, remoteJid, messageId, serialize(message), new Date().toISOString()],
    );
  }

  async acquireSessionLease(sessionId: string, holderId: string, ttlMs: number) {
    const now = Date.now();
    const result = await execute(
      `INSERT INTO whatsapp_session_leases (session_id,holder_id,expires_at,updated_at) VALUES (?,?,?,?)
       ON CONFLICT (session_id) DO UPDATE SET holder_id=excluded.holder_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at
       WHERE whatsapp_session_leases.holder_id=excluded.holder_id OR whatsapp_session_leases.expires_at<=?`,
      [sessionId, holderId, now + ttlMs, new Date(now).toISOString(), now],
    );
    return result.changes === 1;
  }

  async refreshSessionLease(sessionId: string, holderId: string, ttlMs: number) {
    const now = Date.now();
    const result = await execute(
      "UPDATE whatsapp_session_leases SET expires_at=?,updated_at=? WHERE session_id=? AND holder_id=? AND expires_at>?",
      [now + ttlMs, new Date(now).toISOString(), sessionId, holderId, now],
    );
    return result.changes === 1;
  }

  async releaseSessionLease(sessionId: string, holderId: string) {
    await execute("DELETE FROM whatsapp_session_leases WHERE session_id=? AND holder_id=?", [sessionId, holderId]);
  }
}

async function writeKeys(sessionId: string, rows: Array<[string, string, string]>, now: string) {
  for (let index = 0; index < rows.length; index += writeBatchSize) {
    const batch = rows.slice(index, index + writeBatchSize);
    await execute(
      `INSERT INTO whatsapp_auth_keys (session_id,key_type,key_id,payload,updated_at) VALUES ${batch.map(() => "(?,?,?,?,?)").join(",")}
       ON CONFLICT (session_id,key_type,key_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,
      batch.flatMap(([type, id, payload]) => [sessionId, type, id, payload, now]),
    );
  }
}

/**
 * Copies sessions from a desktop-style `whatsapp.db` into PostgreSQL, so a web deployment that ran the
 * in-process WhatsApp runtime keeps its linked accounts when the gateway takes over. Sessions that
 * already exist in PostgreSQL are left untouched; the SQLite file is not modified.
 */
export async function importSqliteWhatsAppAuth(databasePath: string) {
  if (!fs.existsSync(databasePath)) return { imported: 0 };
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  let imported = 0;
  try {
    const hasTables = source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='whatsapp_auth_credentials'").get();
    if (!hasTables) return { imported: 0 };
    const sessions = source.prepare("SELECT session_id AS sessionId,payload,updated_at AS updatedAt FROM whatsapp_auth_credentials").all() as Array<{ sessionId: string; payload: string; updatedAt: string }>;
    for (const session of sessions) {
      if (await queryOne("SELECT 1 AS present FROM whatsapp_auth_credentials WHERE session_id=?", [session.sessionId])) continue;
      const keys = source.prepare("SELECT key_type AS keyType,key_id AS keyId,payload FROM whatsapp_auth_keys WHERE session_id=?").all(session.sessionId) as Array<{ keyType: string; keyId: string; payload: string }>;
      await inTransaction(async () => {
        await execute("INSERT INTO whatsapp_auth_credentials (session_id,payload,updated_at) VALUES (?,?,?) ON CONFLICT (session_id) DO NOTHING", [session.sessionId, session.payload, session.updatedAt]);
        await writeKeys(session.sessionId, keys.map(key => [key.keyType, key.keyId, key.payload]), new Date().toISOString());
      });
      imported += 1;
    }
  } finally {
    source.close();
  }
  return { imported };
}
