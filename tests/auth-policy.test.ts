import assert from "node:assert/strict";
import test from "node:test";
import { authPolicy } from "../src/server/auth/policy";

test("email verification remains disabled for password authentication", () => {
  assert.equal(authPolicy.requireEmailVerification, false);
});
