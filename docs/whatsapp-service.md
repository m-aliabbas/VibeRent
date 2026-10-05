# Standalone WhatsApp service

This unit connects one or more WhatsApp sessions through Baileys without being wired into any VibeRent customer or booking flow.

## Storage and runtime

- Auth credentials and Signal keys are stored in the dedicated `.data/whatsapp.db` SQLite database by default.
- Override the location with `WHATSAPP_DATABASE_PATH`.
- Use a distinct `WHATSAPP_SESSION_ID` for each linked WhatsApp account.
- Run only one active process for a given session ID. SQLite WAL supports the adapter's durable writes, but two Baileys sockets must not control the same linked session.
- The database contains long-lived private keys. It is gitignored and created with owner-only file permissions. Keep it on persistent private storage and include it in encrypted backups.

The main VibeRent database is not read or modified by this unit.

## Pakistani number normalization

`03001234567`, `3001234567`, `+923001234567`, `00923001234567`, and `923001234567` all normalize to:

```text
923001234567@s.whatsapp.net
```

Malformed numbers, landlines, foreign numbers, and group JIDs are rejected. The originally proposed `9230012345678` has one extra digit and is therefore rejected.

## Manual connection test

### Browser test console (recommended)

Run the isolated local test system:

```bash
npm run whatsapp:web-test
```

Open `http://127.0.0.1:4399`. The browser console can:

- start pairing and show the current QR code;
- replace the QR automatically whenever Baileys refreshes it;
- manually request a fresh pairing QR;
- show connection and error states;
- send test text, image, and document messages;
- list incoming messages and download received media; and
- save an incoming image captioned `/add be-213` under `.data/whatsapp-images/be-213/` with a timestamped filename; and
- unlink and clear the test session.

It binds only to localhost and uses a random per-process token for its API calls. It does not use any VibeRent page, Route Handler, customer, booking, or main database.

Incoming image commands use an exact caption such as `/add be-213`. The image is written to `.data/whatsapp-images/be-213/` with a UTC timestamp and WhatsApp message ID in the filename. Override the root with `WHATSAPP_IMAGE_INBOX_PATH`. Folder names may contain letters, numbers, and internal hyphens only.

Sent message content is retained in the dedicated WhatsApp SQLite database (latest 500 messages per session) so Baileys can satisfy WhatsApp retry requests. This specifically supports recovery from the recipient-side “message is waiting” state for newly sent documents and media.

### Terminal harness

Run:

```bash
npm run whatsapp:connect
```

Scan the terminal QR code from **WhatsApp → Linked devices**. The session reconnects from SQLite after a restart, without another scan.

Pairing-code mode is also available:

```bash
WHATSAPP_PAIRING_PHONE=03001234567 npm run whatsapp:connect
```

## Send test messages

Set a recipient plus any payloads you want to exercise:

```bash
WHATSAPP_TEST_TO=03001234567 \
WHATSAPP_TEST_TEXT="VibeRent WhatsApp test" \
WHATSAPP_TEST_IMAGE=/absolute/path/to/car.jpg \
WHATSAPP_TEST_IMAGE_MIME=image/jpeg \
WHATSAPP_TEST_DOCUMENT=/absolute/path/to/agreement.pdf \
WHATSAPP_TEST_DOCUMENT_MIME=application/pdf \
npm run whatsapp:connect
```

The harness logs incoming text, image, and document events. To download received test media into `.data/whatsapp-inbox`, add `WHATSAPP_DOWNLOAD_INCOMING=1`.

## Programmatic use

```ts
import { WhatsAppService } from "@/server/whatsapp";

const whatsapp = new WhatsAppService({ sessionId: "agency-main" });

whatsapp.on("qr", (qr) => renderQrForAnAuthorizedOperator(qr));
whatsapp.on("message", async (message) => {
  console.log(message.text, message.media?.kind);
  const bytes = message.media ? await message.media.download() : undefined;
});
whatsapp.on("error", console.error);

await whatsapp.start();
await whatsapp.sendText("03001234567", "Your booking is confirmed.");
await whatsapp.sendImage("03001234567", {
  image: { url: "/absolute/path/to/vehicle.jpg" },
  caption: "Your vehicle",
  mimeType: "image/jpeg",
});
await whatsapp.sendDocument("03001234567", {
  document: { url: "/absolute/path/to/agreement.pdf" },
  fileName: "agreement.pdf",
  mimeType: "application/pdf",
});
```

Call `stop()` for a temporary shutdown that preserves the session. Call `logout()` only when intentionally unlinking the WhatsApp device; it clears that session from SQLite.

Baileys uses WhatsApp Web and is not an official Meta API. Avoid bulk or unsolicited messaging and account for WhatsApp policy and account-ban risk before production use.
