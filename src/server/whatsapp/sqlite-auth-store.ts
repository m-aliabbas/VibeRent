import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WAMessageContent,
} from "@whiskeysockets/baileys";

type AuthKeyRow = { payload: string };
type CredentialsRow = { payload: string };

function serialize(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}

export type SqliteWhatsAppAuthState = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};

/** Dedicated SQLite-backed implementation of Baileys' AuthenticationState contract. */
export class SqliteWhatsAppAuthStore {
  readonly databasePath: string;
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    this.databasePath = path.resolve(databasePath);
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });

    this.database = new Database(this.databasePath);
    fs.chmodSync(this.databasePath, 0o600);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_auth_credentials (
        session_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
        session_id TEXT NOT NULL,
        key_type TEXT NOT NULL,
        key_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, key_type, key_id)
      );

      CREATE INDEX IF NOT EXISTS whatsapp_auth_keys_session_idx
        ON whatsapp_auth_keys (session_id);

      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        session_id TEXT NOT NULL,
        remote_jid TEXT NOT NULL,
        message_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (session_id, remote_jid, message_id)
      );

      CREATE INDEX IF NOT EXISTS whatsapp_messages_session_created_idx
        ON whatsapp_messages (session_id, created_at DESC);
    `);
  }

  async useSession(sessionId: string): Promise<SqliteWhatsAppAuthState> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("A non-empty WhatsApp session ID is required.");
    }

    const row = this.database
      .prepare("SELECT payload FROM whatsapp_auth_credentials WHERE session_id = ?")
      .get(normalizedSessionId) as CredentialsRow | undefined;
    const creds = row ? deserialize<AuthenticationCreds>(row.payload) : initAuthCreds();

    const saveCreds = async () => {
      const now = new Date().toISOString();
      this.database
        .prepare(`
          INSERT INTO whatsapp_auth_credentials (session_id, payload, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(session_id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        `)
        .run(normalizedSessionId, serialize(creds), now);
    };

    const getKeys = async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};
      const query = this.database.prepare(`
        SELECT payload
        FROM whatsapp_auth_keys
        WHERE session_id = ? AND key_type = ? AND key_id = ?
      `);

      for (const id of ids) {
        const keyRow = query.get(normalizedSessionId, type, id) as AuthKeyRow | undefined;
        if (!keyRow) continue;

        let value = deserialize<SignalDataTypeMap[T]>(keyRow.payload);
        if (type === "app-state-sync-key") {
          value = proto.Message.AppStateSyncKeyData.fromObject(
            value as proto.Message.IAppStateSyncKeyData,
          ) as unknown as SignalDataTypeMap[T];
        }
        result[id] = value;
      }

      return result;
    };

    const setKeys = async (data: SignalDataSet) => {
      const upsert = this.database.prepare(`
        INSERT INTO whatsapp_auth_keys (session_id, key_type, key_id, payload, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, key_type, key_id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `);
      const remove = this.database.prepare(`
        DELETE FROM whatsapp_auth_keys
        WHERE session_id = ? AND key_type = ? AND key_id = ?
      `);

      this.database.transaction(() => {
        const now = new Date().toISOString();
        for (const [type, values] of Object.entries(data)) {
          if (!values) continue;
          for (const [id, value] of Object.entries(values)) {
            if (value == null) {
              remove.run(normalizedSessionId, type, id);
            } else {
              upsert.run(normalizedSessionId, type, id, serialize(value), now);
            }
          }
        }
      })();
    };

    return {
      state: {
        creds,
        keys: {
          get: getKeys,
          set: setKeys,
          clear: async () => this.clearSessionKeys(normalizedSessionId),
        },
      },
      saveCreds,
    };
  }

  clearSession(sessionId: string): void {
    this.database.transaction(() => {
      this.clearSessionKeys(sessionId);
      this.database.prepare("DELETE FROM whatsapp_messages WHERE session_id = ?").run(sessionId);
      this.database
        .prepare("DELETE FROM whatsapp_auth_credentials WHERE session_id = ?")
        .run(sessionId);
    })();
  }

  hasRegisteredSession(sessionId: string): boolean {
    const row = this.database
      .prepare("SELECT payload FROM whatsapp_auth_credentials WHERE session_id = ?")
      .get(sessionId.trim()) as CredentialsRow | undefined;
    if (!row) return false;
    try {
      return deserialize<AuthenticationCreds>(row.payload).registered === true;
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.database.open) this.database.close();
  }

  getMessage(sessionId: string, remoteJid: string, messageId: string): WAMessageContent | undefined {
    const row = this.database.prepare(`
      SELECT payload
      FROM whatsapp_messages
      WHERE session_id = ? AND remote_jid = ? AND message_id = ?
    `).get(sessionId, remoteJid, messageId) as { payload: string } | undefined;
    return row ? deserialize<WAMessageContent>(row.payload) : undefined;
  }

  saveMessage(
    sessionId: string,
    remoteJid: string,
    messageId: string,
    message: WAMessageContent,
  ): void {
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO whatsapp_messages (session_id, remote_jid, message_id, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, remote_jid, message_id) DO UPDATE SET
          payload = excluded.payload,
          created_at = excluded.created_at
      `).run(sessionId, remoteJid, messageId, serialize(message), new Date().toISOString());
      this.database.prepare(`
        DELETE FROM whatsapp_messages
        WHERE session_id = ? AND rowid NOT IN (
          SELECT rowid FROM whatsapp_messages
          WHERE session_id = ?
          ORDER BY created_at DESC
          LIMIT 500
        )
      `).run(sessionId, sessionId);
    })();
  }

  private clearSessionKeys(sessionId: string): void {
    this.database.prepare("DELETE FROM whatsapp_auth_keys WHERE session_id = ?").run(sessionId);
  }
}
