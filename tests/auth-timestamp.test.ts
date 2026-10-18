import assert from "node:assert/strict";
import test from "node:test";
import { authTimestamp } from "../src/server/auth/auth-timestamp";

test("Better Auth timestamps match the selected database column type", () => {
  const date = new Date("2026-10-18T10:00:00.000Z");
  assert.strictEqual(authTimestamp(date, "postgres"), date);
  assert.equal(authTimestamp(date, "sqlite"), date.getTime());
});
