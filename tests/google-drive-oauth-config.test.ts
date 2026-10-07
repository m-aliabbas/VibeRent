import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoogleDriveRedirectUri } from "../src/server/desktop/google-drive-service";

test("normalizes the rent.local development URL to a Google-compatible loopback redirect", () => {
  assert.equal(
    resolveGoogleDriveRedirectUri(undefined, "http://rent.local"),
    "http://127.0.0.1",
  );
});

test("uses the default HTTP port and removes a legacy callback path", () => {
  assert.equal(
    resolveGoogleDriveRedirectUri(
      "http://127.0.0.1/api/v1/backups/google-drive/callback",
      "http://rent.local",
    ),
    "http://127.0.0.1",
  );
});
