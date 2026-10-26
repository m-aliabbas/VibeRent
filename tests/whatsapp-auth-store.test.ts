import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getSharedWhatsAppAuthStore, SqliteWhatsAppAuthStore } from "../src/server/whatsapp/sqlite-auth-store";

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

test("allows only one live process lease per WhatsApp session", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-lease-"));
  const databasePath = path.join(directory, "whatsapp.db");
  try {
    const first = new SqliteWhatsAppAuthStore(databasePath);
    const second = new SqliteWhatsAppAuthStore(databasePath);
    assert.equal(first.acquireSessionLease("agency-one", "process-a", 30_000), true);
    assert.equal(second.acquireSessionLease("agency-one", "process-b", 30_000), false);
    assert.equal(first.refreshSessionLease("agency-one", "process-a", 30_000), true);
    first.releaseSessionLease("agency-one", "process-a");
    assert.equal(second.acquireSessionLease("agency-one", "process-b", 30_000), true);
    first.close();
    second.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("finds retained retry content when WhatsApp changes the remote JID", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-retry-"));
  const databasePath = path.join(directory, "whatsapp.db");
  try {
    const store = new SqliteWhatsAppAuthStore(databasePath);
    store.saveMessage("agency-one", "12345@lid", "message-one", { conversation: "receipt" });
    assert.equal(store.getMessage("agency-one", "923001234567@s.whatsapp.net", "message-one")?.conversation, "receipt");
    store.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("reads many Signal keys of one type in a single batched call", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-batch-"));
  const databasePath = path.join(directory, "whatsapp.db");
  try {
    const store = new SqliteWhatsAppAuthStore(databasePath);
    const { state } = await store.useSession("agency-one");
    await state.keys.set({
      "pre-key": {
        "1": { public: Buffer.from("public-1"), private: Buffer.from("private-1") },
        "2": { public: Buffer.from("public-2"), private: Buffer.from("private-2") },
      },
      session: { "1": Buffer.from("not-a-pre-key") },
    });
    const keys = await state.keys.get("pre-key", ["1", "2", "3"]);
    assert.deepEqual(Object.keys(keys).sort(), ["1", "2"]);
    assert.deepEqual(Buffer.from(keys["2"].private), Buffer.from("private-2"));
    assert.deepEqual(await state.keys.get("pre-key", []), {});
    store.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("prunes retained messages to the newest entries", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-prune-"));
  const databasePath = path.join(directory, "whatsapp.db");
  try {
    const store = new SqliteWhatsAppAuthStore(databasePath);
    for (let index = 0; index < 5; index += 1) {
      store.saveMessage("agency-one", "923001234567@s.whatsapp.net", `message-${index}`, { conversation: `receipt ${index}` });
      // created_at has millisecond precision; keep entries strictly ordered.
      const until = Date.now() + 2;
      while (Date.now() < until) { /* wait */ }
    }
    store.saveMessage("agency-two", "923001234567@s.whatsapp.net", "other", { conversation: "other agency" });
    assert.equal(store.pruneMessages("agency-one", 2), 3);
    assert.equal(store.getMessage("agency-one", "923001234567@s.whatsapp.net", "message-4")?.conversation, "receipt 4");
    assert.equal(store.getMessage("agency-one", "923001234567@s.whatsapp.net", "message-3")?.conversation, "receipt 3");
    assert.equal(store.getMessage("agency-one", "923001234567@s.whatsapp.net", "message-2"), undefined);
    assert.equal(store.getMessage("agency-two", "923001234567@s.whatsapp.net", "other")?.conversation, "other agency");
    assert.equal(store.pruneMessages("agency-two", 2), 0);
    store.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("shares one connection per database file and reopens it after close", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-whatsapp-shared-"));
  const databasePath = path.join(directory, "whatsapp.db");
  try {
    const first = getSharedWhatsAppAuthStore(databasePath);
    assert.equal(getSharedWhatsAppAuthStore(path.join(directory, ".", "whatsapp.db")), first);
    first.close();
    const reopened = getSharedWhatsAppAuthStore(databasePath);
    assert.notEqual(reopened, first);
    assert.equal(reopened.isOpen, true);
    reopened.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
