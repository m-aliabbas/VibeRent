import assert from "node:assert/strict";
import test from "node:test";
import { cronMatches, zonedMinute } from "../src/server/jobs/cron";

test("matches the five-field patterns used by job schedules", () => {
  const at = { minute: 5, hour: 12, dayOfMonth: 26, month: 10, dayOfWeek: 1 };
  assert.equal(cronMatches("5 * * * *", at), true);
  assert.equal(cronMatches("0 12 * * *", at), false);
  assert.equal(cronMatches("0 12 * * *", { ...at, minute: 0 }), true);
  assert.equal(cronMatches("*/5 * * * *", at), true);
  assert.equal(cronMatches("*/10 * * * *", at), false);
  assert.equal(cronMatches("0-10/5 9-17 * * 1-5", at), true);
  assert.equal(cronMatches("5 12 * * 0,6", at), false);
  assert.throws(() => cronMatches("5 * * *", at), /five fields/);
});

test("reads wall-clock time in Pakistan regardless of the host time zone", () => {
  const minute = zonedMinute(new Date("2026-10-26T07:00:30Z"), "Asia/Karachi");
  assert.equal(minute.hour, 12);
  assert.equal(minute.minute, 0);
  assert.equal(minute.dayOfWeek, 1);
  assert.equal(minute.key, "2026-10-26T12:00");
});
