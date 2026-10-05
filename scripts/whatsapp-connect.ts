import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode-terminal";
import { getDataDirectory } from "../src/server/desktop/runtime-paths";
import {
  WhatsAppService,
  type IncomingWhatsAppMessage,
} from "../src/server/whatsapp";

const service = new WhatsAppService({ sessionId: process.env.WHATSAPP_SESSION_ID ?? "default" });
let sentTestMessages = false;

service.on("qr", (qr: string) => {
  console.log("Scan this QR from WhatsApp > Linked devices:");
  qrcode.generate(qr, { small: true });
});

service.on("status", (status) => console.log(`WhatsApp status: ${status}`));
service.on("connected", async () => {
  console.log("WhatsApp connected. Press Ctrl+C to stop.");
  if (sentTestMessages || !process.env.WHATSAPP_TEST_TO) return;
  sentTestMessages = true;

  const recipient = process.env.WHATSAPP_TEST_TO;
  if (process.env.WHATSAPP_TEST_TEXT) {
    const result = await service.sendText(recipient, process.env.WHATSAPP_TEST_TEXT);
    console.log(`Sent text message ${result.id}.`);
  }
  if (process.env.WHATSAPP_TEST_IMAGE) {
    const result = await service.sendImage(recipient, {
      image: { url: path.resolve(process.env.WHATSAPP_TEST_IMAGE) },
      caption: process.env.WHATSAPP_TEST_CAPTION,
      mimeType: process.env.WHATSAPP_TEST_IMAGE_MIME,
    });
    console.log(`Sent image message ${result.id}.`);
  }
  if (process.env.WHATSAPP_TEST_DOCUMENT) {
    const documentPath = path.resolve(process.env.WHATSAPP_TEST_DOCUMENT);
    const result = await service.sendDocument(recipient, {
      document: { url: documentPath },
      fileName: path.basename(documentPath),
      mimeType: process.env.WHATSAPP_TEST_DOCUMENT_MIME ?? "application/octet-stream",
      caption: process.env.WHATSAPP_TEST_CAPTION,
    });
    console.log(`Sent document message ${result.id}.`);
  }
});

service.on("message", async (message: IncomingWhatsAppMessage) => {
  console.log(
    `Received ${message.media?.kind ?? "text"} message ${message.id}` +
      (message.text ? `: ${message.text}` : "."),
  );

  if (!message.media || process.env.WHATSAPP_DOWNLOAD_INCOMING !== "1") return;
  const extension = message.media.kind === "image" ? ".jpg" : "";
  const safeName = path.basename(message.media.fileName ?? `${message.id}${extension}`);
  const inbox = path.join(getDataDirectory(), "whatsapp-inbox");
  fs.mkdirSync(inbox, { recursive: true });
  const target = path.join(inbox, safeName);
  fs.writeFileSync(target, await message.media.download(), { mode: 0o600 });
  console.log(`Downloaded incoming media to ${target}.`);
});

service.on("error", (error) => console.error("WhatsApp service error:", error));

async function shutdown() {
  await service.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await service.start();

if (process.env.WHATSAPP_PAIRING_PHONE) {
  const code = await service.requestPairingCode(process.env.WHATSAPP_PAIRING_PHONE);
  console.log(`WhatsApp pairing code: ${code}`);
}
