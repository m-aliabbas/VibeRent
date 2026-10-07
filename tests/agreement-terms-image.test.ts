import assert from "node:assert/strict";
import test from "node:test";
import {
  composeTermsSnapshot,
  defaultAgreementConfig,
  normalizeAgreementConfig,
  parseTermsImageSnapshot,
} from "../src/lib/agreement-config";

const fileId = "file_123e4567-e89b-12d3-a456-426614174000";

test("image terms replace written terms in the booking snapshot", () => {
  const config = normalizeAgreementConfig({
    ...defaultAgreementConfig,
    termsSource: "image",
    termsImage: { id: fileId, name: "office-terms.png", url: "https://untrusted.example/image.png" },
  });

  assert.equal(config.termsSource, "image");
  assert.deepEqual(config.termsImage, {
    id: fileId,
    name: "office-terms.png",
    url: `/api/v1/files/${fileId}`,
  });
  assert.equal(parseTermsImageSnapshot(composeTermsSnapshot(config)), fileId);
});

test("invalid or missing image references fall back to written terms", () => {
  const config = normalizeAgreementConfig({ ...defaultAgreementConfig, termsSource: "image", termsImage: null });

  assert.equal(config.termsSource, "text");
  assert.equal(config.termsImage, null);
  assert.equal(parseTermsImageSnapshot(composeTermsSnapshot(config)), null);
});
