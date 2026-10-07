import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("rewrites a Google desktop OAuth loopback response to the callback route", () => {
  const request = new NextRequest("http://127.0.0.1/?code=authorization-code&state=oauth-state");

  const response = proxy(request);
  const rewritten = new URL(response.headers.get("x-middleware-rewrite")!);

  assert.equal(rewritten.pathname, "/api/v1/backups/google-drive/callback");
  assert.equal(rewritten.searchParams.get("code"), "authorization-code");
  assert.equal(rewritten.searchParams.get("state"), "oauth-state");
});

test("does not rewrite unrelated root requests", () => {
  const request = new NextRequest("http://127.0.0.1/?code=ordinary-filter");

  const response = proxy(request);

  assert.equal(response.headers.get("x-middleware-rewrite"), null);
});
