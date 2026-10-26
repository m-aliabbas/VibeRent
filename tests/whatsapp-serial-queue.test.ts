import assert from "node:assert/strict";
import test from "node:test";
import { createSerialQueue } from "../src/server/whatsapp/serial-queue";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("applies writes for one session in call order even when earlier writes are slower", async () => {
  const run = createSerialQueue();
  const stored: string[] = [];
  // Without the queue the fast second write would land first and the slow first write would overwrite it.
  await Promise.all([
    run("agency-one", async () => { await wait(30); stored.push("ratchet-1"); }),
    run("agency-one", async () => { await wait(1); stored.push("ratchet-2"); }),
    run("agency-one", async () => { stored.push("ratchet-3"); }),
  ]);
  assert.deepEqual(stored, ["ratchet-1", "ratchet-2", "ratchet-3"]);
});

test("keeps sessions independent and survives a failed operation", async () => {
  const run = createSerialQueue();
  const order: string[] = [];
  const slow = run("agency-one", async () => { await wait(30); order.push("one"); });
  const other = run("agency-two", async () => { order.push("two"); });
  const failing = run("agency-one", async () => { throw new Error("write failed"); });
  const after = run("agency-one", async () => { order.push("one-after-failure"); return "ok"; });
  await other;
  assert.deepEqual(order, ["two"], "another session does not wait behind agency-one");
  await slow;
  await assert.rejects(failing, /write failed/);
  assert.equal(await after, "ok");
  assert.deepEqual(order, ["two", "one", "one-after-failure"]);
});
