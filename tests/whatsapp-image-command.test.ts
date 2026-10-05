import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseAddImageCommand,
  parseCnicImageCommand,
  saveAddImageCommand,
} from "../src/server/whatsapp/incoming-image-command";
import type { IncomingWhatsAppMessage } from "../src/server/whatsapp/types";

test("parses a safe add-image folder command", () => {
  assert.deepEqual(parseAddImageCommand(" /add BE-213 "), { folder: "be-213" });
  assert.equal(parseAddImageCommand("/add ../be-213"), null);
  assert.equal(parseAddImageCommand("/add be-213/other"), null);
  assert.equal(parseAddImageCommand("hello"), null);
});

test("parses CNIC front and back aliases with a numeric booking number",()=>{
  for(const caption of ["/id1 12","/ID1 12","/id-1 12","/front 12"]) assert.deepEqual(parseCnicImageCommand(caption),{side:"front",bookingNumber:12});
  for(const caption of ["/id2 9","/ID-2 9","/back 9"]) assert.deepEqual(parseCnicImageCommand(caption),{side:"back",bookingNumber:9});
  assert.equal(parseCnicImageCommand("/front BKG-12"),null);
  assert.equal(parseCnicImageCommand("/id1 0"),null);
  assert.equal(parseCnicImageCommand("/id1 12 extra"),null);
});

test("saves a commanded image in a timestamped folder path", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-image-"));
  const message: IncomingWhatsAppMessage = {
    id: "ABC/123",
    chatJid: "923025114945@s.whatsapp.net",
    senderJid: "923025114945@s.whatsapp.net",
    senderNumber: "923025114945",
    receivedAt: new Date("2026-10-04T08:09:10.123Z"),
    text: "/add be-213",
    media: {
      kind: "image",
      mimeType: "image/png",
      caption: "/add be-213",
      download: async () => Buffer.from("test-image"),
    },
  };

  try {
    const saved = await saveAddImageCommand(message, directory);
    assert.ok(saved);
    assert.equal(saved.folder, "be-213");
    assert.equal(saved.fileName, "2026-10-04_08-09-10.123_ABC123.png");
    assert.equal(
      fs.readFileSync(path.join(directory, "be-213", saved.fileName), "utf8"),
      "test-image",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
