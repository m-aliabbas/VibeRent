import type { AuthenticationState, WAMessageContent } from "@whiskeysockets/baileys";

type MaybePromise<T> = T | Promise<T>;

/**
 * Baileys session storage plus the per-session lease that keeps one socket per WhatsApp account.
 * Desktop/LAN use the dedicated SQLite file (`SqliteWhatsAppAuthStore`); the web gateway uses
 * PostgreSQL (`PostgresWhatsAppAuthStore`) so any gateway container can take a session over.
 */
export interface WhatsAppAuthStore {
  useSession(sessionId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>;
  clearSession(sessionId: string): MaybePromise<void>;
  hasRegisteredSession(sessionId: string): MaybePromise<boolean>;
  getMessage(sessionId: string, remoteJid: string, messageId: string): MaybePromise<WAMessageContent | undefined>;
  saveMessage(sessionId: string, remoteJid: string, messageId: string, message: WAMessageContent): MaybePromise<void>;
  acquireSessionLease(sessionId: string, holderId: string, ttlMs: number): MaybePromise<boolean>;
  refreshSessionLease(sessionId: string, holderId: string, ttlMs: number): MaybePromise<boolean>;
  releaseSessionLease(sessionId: string, holderId: string): MaybePromise<void>;
}
