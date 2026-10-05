import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SqliteWhatsAppAuthStore } from "../src/server/whatsapp/sqlite-auth-store";

test("persists credentials and Signal keys in the dedicated SQLite database", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-"));
  const databasePath = path.join(directory, "whatsapp.db");

  try {
    const firstStore = new SqliteWhatsAppAuthStore(databasePath);
    const first = await firstStore.useSession("agency-one");
    first.state.creds.registered = true;
    await first.saveCreds();
    await first.state.keys.set({
      session: { customer: Buffer.from("signal-session") },
    });
    firstStore.saveMessage(
      "agency-one",
      "923001234567@s.whatsapp.net",
      "message-one",
      { documentMessage: { fileName: "agreement.pdf", mimetype: "application/pdf" } },
    );
    firstStore.close();

    const secondStore = new SqliteWhatsAppAuthStore(databasePath);
    assert.equal(secondStore.hasRegisteredSession("agency-one"), true);
    const restored = await secondStore.useSession("agency-one");
    const keys = await restored.state.keys.get("session", ["customer", "missing"]);

    assert.equal(restored.state.creds.registered, true);
    assert.deepEqual(Buffer.from(keys.customer), Buffer.from("signal-session"));
    assert.equal(keys.missing, undefined);
    assert.equal(
      secondStore.getMessage(
        "agency-one",
        "923001234567@s.whatsapp.net",
        "message-one",
      )?.documentMessage?.fileName,
      "agreement.pdf",
    );

    secondStore.clearSession("agency-one");
    assert.equal(secondStore.hasRegisteredSession("agency-one"), false);
    const cleared = await secondStore.useSession("agency-one");
    assert.equal(cleared.state.creds.registered, false);
    assert.deepEqual(await cleared.state.keys.get("session", ["customer"]), {});
    assert.equal(
      secondStore.getMessage(
        "agency-one",
        "923001234567@s.whatsapp.net",
        "message-one",
      ),
      undefined,
    );
    secondStore.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
