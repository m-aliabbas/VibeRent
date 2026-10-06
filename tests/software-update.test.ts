import assert from "node:assert/strict";
import test from "node:test";
import { compareReleaseVersions, isReleaseVersion } from "../src/lib/software-update";

test("release versions are compared numerically", () => {
  assert.equal(compareReleaseVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareReleaseVersions("2.0.0", "2.0.0"), 0);
  assert.equal(compareReleaseVersions("1.0.7", "1.1.0"), -1);
});

test("only release versions supported by the release workflow are accepted", () => {
  assert.equal(isReleaseVersion("1.0.7"), true);
  assert.equal(isReleaseVersion("v1.0.7"), false);
  assert.equal(isReleaseVersion("1.0.7-beta.1"), false);
  assert.throws(() => compareReleaseVersions("latest", "1.0.0"));
});
