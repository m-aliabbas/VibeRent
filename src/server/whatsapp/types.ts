import type { WAMediaUpload } from "@whiskeysockets/baileys";

export type WhatsAppConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "logged_out";

export type IncomingWhatsAppMedia = {
  kind: "image" | "document";
  mimeType?: string;
  fileName?: string;
  caption?: string;
  download: () => Promise<Buffer>;
};

export type IncomingWhatsAppMessage = {
  id: string;
  chatJid: string;
  senderJid: string;
  senderNumber: string;
  receivedAt: Date;
  text?: string;
  media?: IncomingWhatsAppMedia;
};

export type SendImageInput = {
  image: WAMediaUpload;
  caption?: string;
  mimeType?: string;
};

export type SendDocumentInput = {
  document: WAMediaUpload;
  mimeType: string;
  fileName: string;
  caption?: string;
};

export type SentWhatsAppMessage = {
  id: string;
  jid: string;
};
