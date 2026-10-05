import { EventEmitter } from "node:events";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino, { type Logger } from "pino";
import { getWhatsAppDatabasePath } from "@/server/desktop/runtime-paths";
import { normalizePakistanPhone, toWhatsAppJid, whatsAppJidUser } from "./pakistan-phone";
import { SqliteWhatsAppAuthStore } from "./sqlite-auth-store";
import type {
  IncomingWhatsAppMessage,
  SendDocumentInput,
  SendImageInput,
  SentWhatsAppMessage,
  WhatsAppConnectionStatus,
} from "./types";

export type WhatsAppServiceOptions = {
  sessionId: string;
  databasePath?: string;
  logger?: Logger;
  reconnectDelayMs?: number;
  checkRecipientBeforeSending?: boolean;
};

function disconnectStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("output" in error)) return undefined;
  const output = (error as { output?: { statusCode?: unknown } }).output;
  return typeof output?.statusCode === "number" ? output.statusCode : undefined;
}

function timestampToDate(value: WAMessage["messageTimestamp"]): Date {
  if (!value) return new Date();
  const seconds = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

/** Long-lived, single-process Baileys gateway. It is not started automatically by Next.js. */
export class WhatsAppService extends EventEmitter {
  private readonly options: Required<
    Pick<WhatsAppServiceOptions, "reconnectDelayMs" | "checkRecipientBeforeSending">
  > &
    WhatsAppServiceOptions;
  private readonly logger: Logger;
  private readonly authStore: SqliteWhatsAppAuthStore;
  private socket?: WASocket;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = true;
  private status: WhatsAppConnectionStatus = "idle";

  constructor(options: WhatsAppServiceOptions) {
    super();
    if (!options.sessionId.trim()) throw new Error("A WhatsApp session ID is required.");

    this.options = {
      reconnectDelayMs: 3_000,
      checkRecipientBeforeSending: true,
      ...options,
    };
    this.logger = options.logger ?? pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "info" });
    this.authStore = new SqliteWhatsAppAuthStore(
      options.databasePath ?? getWhatsAppDatabasePath(),
    );
  }

  get connectionStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.end(undefined);
    this.socket = undefined;
    this.setStatus("disconnected");
  }

  async close(): Promise<void> {
    await this.stop();
    this.authStore.close();
  }

  async logout(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.socket) await this.socket.logout("VibeRent WhatsApp session logged out");
    this.socket = undefined;
    this.authStore.clearSession(this.options.sessionId);
    this.setStatus("logged_out");
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    const socket = this.requireSocket();
    return socket.requestPairingCode(normalizePakistanPhone(phoneNumber));
  }

  async isRegistered(phoneNumber: string): Promise<boolean> {
    const result = await this.requireSocket().onWhatsApp(toWhatsAppJid(phoneNumber));
    return result?.[0]?.exists === true;
  }

  async sendText(phoneNumber: string, text: string): Promise<SentWhatsAppMessage> {
    if (!text.trim()) throw new Error("WhatsApp text cannot be empty.");
    return this.send(phoneNumber, { text });
  }

  async sendImage(
    phoneNumber: string,
    input: SendImageInput,
  ): Promise<SentWhatsAppMessage> {
    return this.send(phoneNumber, {
      image: input.image,
      caption: input.caption,
      mimetype: input.mimeType,
    });
  }

  async sendDocument(
    phoneNumber: string,
    input: SendDocumentInput,
  ): Promise<SentWhatsAppMessage> {
    return this.send(phoneNumber, {
      document: input.document,
      mimetype: input.mimeType,
      fileName: input.fileName,
      caption: input.caption,
    });
  }

  private async send(
    phoneNumber: string,
    content: Parameters<WASocket["sendMessage"]>[1],
  ): Promise<SentWhatsAppMessage> {
    const socket = this.requireConnectedSocket();
    const jid = toWhatsAppJid(phoneNumber);
    if (this.options.checkRecipientBeforeSending) {
      try {
        if (!(await this.isRegistered(phoneNumber))) throw new Error("The recipient is not registered on WhatsApp.");
      } catch (error) {
        if (error instanceof Error && error.message.includes("not registered")) throw error;
        this.logger.warn({ err:error },"WhatsApp recipient lookup failed; attempting direct delivery");
      }
    }

    const message = await socket.sendMessage(jid, content);
    const id = message?.key.id;
    if (!id) throw new Error("WhatsApp did not return a message ID.");
    if (message.message) {
      this.authStore.saveMessage(this.options.sessionId, jid, id, message.message);
    }
    return { id, jid };
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus("connecting");
    const { state, saveCreds } = await this.authStore.useSession(this.options.sessionId);
    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key) => {
        if (!key.remoteJid || !key.id) return undefined;
        return this.authStore.getMessage(this.options.sessionId, key.remoteJid, key.id);
      },
    });
    this.socket = socket;

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", (update) => {
      if (update.qr) this.emit("qr", update.qr);

      if (update.connection === "open") {
        this.setStatus("connected");
        this.emit("connected", { jid: socket.user?.id });
      }

      if (update.connection === "close") {
        const code = disconnectStatusCode(update.lastDisconnect?.error);
        const loggedOut = code === DisconnectReason.loggedOut;
        this.socket = undefined;
        this.setStatus(loggedOut ? "logged_out" : "disconnected");
        this.emit("disconnected", { code, loggedOut });
        if (loggedOut) {
          this.stopped = true;
          this.authStore.clearSession(this.options.sessionId);
        } else if (!this.stopped) {
          this.scheduleReconnect();
        }
      }
    });
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      for (const message of messages) {
        if (message.key.remoteJid && message.key.id && message.message) {
          this.authStore.saveMessage(
            this.options.sessionId,
            message.key.remoteJid,
            message.key.id,
            message.message,
          );
        }
      }
      if (type !== "notify") return;
      for (const message of messages) this.handleIncomingMessage(message);
    });
  }

  private handleIncomingMessage(message: WAMessage): void {
    if (message.key.fromMe || !message.key.id || !message.key.remoteJid) return;
    if (message.key.remoteJid === "status@broadcast") return;

    const content = normalizeMessageContent(message.message);
    if (!content) return;

    const image = content.imageMessage;
    const document = content.documentMessage;
    const text =
      content.conversation ??
      content.extendedTextMessage?.text ??
      image?.caption ??
      document?.caption ??
      undefined;
    if (!text && !image && !document) return;

    const senderJid =
      message.key.participantPn ??
      message.key.participant ??
      message.key.senderPn ??
      message.key.remoteJid;
    const incoming: IncomingWhatsAppMessage = {
      id: message.key.id,
      chatJid: message.key.remoteJid,
      senderJid,
      senderNumber: whatsAppJidUser(senderJid),
      receivedAt: timestampToDate(message.messageTimestamp),
      text: text || undefined,
    };

    if (image || document) {
      incoming.media = {
        kind: image ? "image" : "document",
        mimeType: image?.mimetype ?? document?.mimetype ?? undefined,
        fileName: document?.fileName ?? undefined,
        caption: image?.caption ?? document?.caption ?? undefined,
        download: () =>
          downloadMediaMessage(message, "buffer", {}, {
            logger: this.logger,
            reuploadRequest: (mediaMessage) =>
              this.requireConnectedSocket().updateMediaMessage(mediaMessage),
          }),
      };
    }

    this.emit("message", incoming);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: unknown) => {
        this.emit("error", error);
        this.scheduleReconnect();
      });
    }, this.options.reconnectDelayMs);
  }

  private requireSocket(): WASocket {
    if (!this.socket) throw new Error("WhatsApp service has not been started.");
    return this.socket;
  }

  private requireConnectedSocket(): WASocket {
    if (this.status !== "connected") throw new Error("WhatsApp is not connected.");
    return this.requireSocket();
  }

  private setStatus(status: WhatsAppConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}
