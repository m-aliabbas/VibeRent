import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { seal, unseal } from "../src/server/web-drive/web-drive-service";

const prior=process.env.BETTER_AUTH_SECRET;
before(()=>{process.env.BETTER_AUTH_SECRET="test-only-secret-with-at-least-thirty-two-characters"});
after(()=>{if(prior===undefined)delete process.env.BETTER_AUTH_SECRET;else process.env.BETTER_AUTH_SECRET=prior});

test("web Drive OAuth state and tokens round trip through authenticated encryption",()=>{
  const payload={state:"random-state",agencyId:"agency-a",authUserId:"user-a",verifier:"pkce-secret"};
  const encrypted=seal(payload);
  assert.notEqual(encrypted,JSON.stringify(payload));
  assert.deepEqual(unseal<typeof payload>(encrypted),payload);
  const changed=Buffer.from(encrypted,"base64url");changed[changed.length-1]^=1;
  assert.throws(()=>unseal(changed.toString("base64url")),/invalid/i);
});
