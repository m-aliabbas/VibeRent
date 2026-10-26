import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// The SQLite runtime reads its database path when first imported, so configure it before importing.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "viberent-jobs-"));
const databasePath = path.join(directory, "viberent.db");
process.env.VIBERENT_DATABASE = "sqlite";
process.env.VIBERENT_DATA_DIR = directory;
process.env.SQLITE_DATABASE_PATH = databasePath;
{
  const setup = new Database(databasePath);
  setup.pragma("foreign_keys = OFF");
  migrate(drizzle(setup), { migrationsFolder: path.resolve("drizzle") });
  setup.prepare("INSERT INTO agencies (id,name,created_at,updated_at) VALUES ('agy-test','Test Rentals',?,?)").run(new Date().toISOString(), new Date().toISOString());
  setup.close();
}

type Modules = typeof import("../src/db/query") & typeof import("../src/server/jobs/local-queue")
  & typeof import("../src/server/notifications/notification-service") & typeof import("../src/server/notifications/render-job");
let modules: Modules;
test.before(async () => {
  modules = Object.assign({},
    await import("../src/db/query"), await import("../src/server/jobs/local-queue"),
    await import("../src/server/notifications/notification-service"), await import("../src/server/notifications/render-job"));
});
const execute: Modules["execute"] = (...args) => modules.execute(...args);
const inTransaction: Modules["inTransaction"] = (...args) => modules.inTransaction(...args);
const queryAll: Modules["queryAll"] = (...args) => modules.queryAll(...args);
const queryOne: Modules["queryOne"] = (...args) => modules.queryOne(...args);
const queueSystemNotification: Modules["queueSystemNotification"] = (...args) => modules.queueSystemNotification(...args);
const loadDelivery: Modules["loadDelivery"] = (...args) => modules.loadDelivery(...args);
const renderNotificationJob: Modules["renderNotificationJob"] = (...args) => modules.renderNotificationJob(...args);
const newQueue = () => new modules.LocalJobQueue();

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

async function jobs() {
  return queryAll<{ name: string; status: string; attempts: number; singletonKey: string | null; lastError: string | null }>(
    "SELECT name,status,attempts,singleton_key AS singletonKey,last_error AS lastError FROM background_jobs ORDER BY created_at",
  );
}

test("ignores a second job with the same singleton key while the first is pending", async () => {
  await execute("DELETE FROM background_jobs");
  const queue = newQueue();
  await queue.enqueue("wa.send", { deliveryId: "ntf_a" }, { singletonKey: "ntf_a" });
  await queue.enqueue("wa.send", { deliveryId: "ntf_a" }, { singletonKey: "ntf_a" });
  await queue.enqueue("wa.send", { deliveryId: "ntf_b" }, { singletonKey: "ntf_b" });
  assert.deepEqual((await jobs()).map(job => job.singletonKey), ["ntf_a", "ntf_b"]);
});

test("a job enqueued in a rolled-back transaction never exists", async () => {
  await execute("DELETE FROM background_jobs");
  const queue = newQueue();
  await assert.rejects(inTransaction(async () => {
    await queue.enqueue("wa.send", { deliveryId: "ntf_rollback" });
    throw new Error("business rule failed");
  }, { immediate: true }), /business rule failed/);
  assert.equal((await jobs()).length, 0);
});

test("runs handlers, retries a failure later, and marks a job failed after its retry limit", async () => {
  await execute("DELETE FROM background_jobs");
  const queue = newQueue();
  let calls = 0;
  await queue.start({
    "wa.control": async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket not ready");
    },
    "maintenance.cleanup": async () => { throw new Error("always fails"); },
  }, { schedules: false });
  try {
    await queue.enqueue("wa.control", { agencyId: "agy-test", action: "connect" });
    await queue.drain();
    let [job] = await jobs();
    assert.equal(job.status, "pending");
    assert.equal(job.attempts, 1);
    assert.equal(job.lastError, "socket not ready");

    // Make the retry due now instead of waiting for the backoff.
    await execute("UPDATE background_jobs SET run_at=?", [new Date(0).toISOString()]);
    await queue.drain();
    assert.equal(calls, 2);
    assert.equal((await jobs()).length, 0, "a completed job is removed");

    await queue.enqueue("maintenance.cleanup", {});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await execute("UPDATE background_jobs SET run_at=?", [new Date(0).toISOString()]);
      await queue.drain();
    }
    [job] = await jobs();
    assert.equal(job.status, "failed");
    assert.equal(job.attempts, 2, "maintenance.cleanup allows one retry");
  } finally {
    await queue.stop();
  }
});

test("a queued notice is rendered and handed to the WhatsApp send job", async () => {
  await execute("DELETE FROM background_jobs");
  const result = await queueSystemNotification("agy-test", {
    kind: "owner.command_reply", entityId: "wamid-1", payload: { text: "Today: 3 pickups", phone: "923001234567" }, idempotencyKey: "owner.command_reply:wamid-1",
  });
  assert.equal(result.status, "queued");
  const duplicate = await queueSystemNotification("agy-test", { kind: "owner.command_reply", entityId: "wamid-1", payload: {}, idempotencyKey: "owner.command_reply:wamid-1" });
  assert.equal(duplicate.deliveryId, result.deliveryId, "the same idempotency key reuses the delivery");
  assert.deepEqual((await jobs()).map(job => job.name), ["notify.render"]);

  await renderNotificationJob({ deliveryId: result.deliveryId! }, { jobId: "job-test", attempt: 1 });
  const delivery = await loadDelivery(result.deliveryId!);
  assert.equal(delivery?.status, "ready");
  assert.equal(delivery?.recipientPhone, "923001234567");
  assert.equal(delivery?.messageText, "Today: 3 pickups");
  const send = await queryOne<{ name: string; singletonKey: string }>("SELECT name,singleton_key AS singletonKey FROM background_jobs WHERE name='wa.send'");
  assert.equal(send?.singletonKey, result.deliveryId);

  // Rendering is idempotent: a duplicate run leaves the ready delivery alone.
  await renderNotificationJob({ deliveryId: result.deliveryId! }, { jobId: "job-test-2", attempt: 1 });
  assert.equal((await loadDelivery(result.deliveryId!))?.status, "ready");
});

test("the gateway marks a delivery failed without retrying when WhatsApp was never linked", async () => {
  const result = await queueSystemNotification("agy-test", {
    kind: "owner.command_reply", entityId: "wamid-2", payload: { text: "Help", phone: "923001234567" }, idempotencyKey: "owner.command_reply:wamid-2",
  });
  await renderNotificationJob({ deliveryId: result.deliveryId! }, { jobId: "job-render", attempt: 1 });
  const { gatewayHandlers } = await import("../src/server/whatsapp/gateway");
  await gatewayHandlers["wa.send"]!({ deliveryId: result.deliveryId! }, { jobId: "job-send", attempt: 1 });
  const delivery = await loadDelivery(result.deliveryId!);
  assert.equal(delivery?.status, "failed");
  assert.equal(delivery?.lastErrorCode, "whatsapp_not_configured");
  assert.equal(delivery?.attempts, 1);
});
