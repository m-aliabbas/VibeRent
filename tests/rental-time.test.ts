import assert from "node:assert/strict";
import test from "node:test";
import { calculateLateReturn, formatLateReturnDuration } from "../src/lib/rental-time";

test("calculates an overnight late return from the agreed time", () => {
  const duration=calculateLateReturn("2026-10-14T15:00:00.000Z","2026-10-14T21:00:00.000Z");
  assert.deepEqual(duration,{late:true,minutes:360,hours:6,remainingMinutes:0});
  assert.equal(formatLateReturnDuration(duration),"6 hrs");
});

test("does not mark an on-time return as late", () => {
  assert.deepEqual(calculateLateReturn("2026-10-14T15:00:00.000Z","2026-10-14T14:59:00.000Z"),{late:false,minutes:0,hours:0,remainingMinutes:0});
});
