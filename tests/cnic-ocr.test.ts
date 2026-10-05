import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import {
  CnicOcrService,
  formatCnicOcrText,
  MAX_CNIC_IMAGE_BYTES,
  type CnicOcrGateway,
} from "../src/server/cnic-ocr/cnic-ocr-service";
import { OpenAiCnicOcrGateway } from "../src/server/cnic-ocr/openai-cnic-ocr-gateway";
import { CnicOcrError } from "../src/server/cnic-ocr/types";

const fictionalResult = {
  name: "AHSAN RAZA",
  cnic: "35202-1234567-1",
  dob: "01.01.1990",
  id_expiry: "01.01.2030",
};

test("converts image bytes to a data URL and parses the OCR contract", async () => {
  let receivedDataUrl = "";
  const gateway: CnicOcrGateway = {
    extract: async (imageDataUrl) => {
      receivedDataUrl = imageDataUrl;
      return JSON.stringify({ ...fictionalResult, name: "  AHSAN RAZA  " });
    },
  };

  const result = await new CnicOcrService(gateway).extract({
    imageBytes: Uint8Array.from([1, 2, 3]),
    mimeType: "image/jpeg",
  });

  assert.equal(receivedDataUrl, "data:image/jpeg;base64,AQID");
  assert.deepEqual(result, fictionalResult);
});

test("formats the exact text contract", () => {
  assert.equal(
    formatCnicOcrText(fictionalResult),
    [
      "name: AHSAN RAZA",
      "cnic: 35202-1234567-1",
      "dob: 01.01.1990",
      "id_expiry: 01.01.2030",
    ].join("\n"),
  );
});

test("keeps unreadable fields null and renders them as blank text", async () => {
  const service = new CnicOcrService({
    extract: async () =>
      JSON.stringify({ name: "AHSAN RAZA", cnic: null, dob: null, id_expiry: null }),
  });

  const result = await service.extract({
    imageBytes: Uint8Array.from([1]),
    mimeType: "image/png",
  });

  assert.equal(result.cnic, null);
  assert.match(formatCnicOcrText(result), /^cnic: $/m);
});

test("rejects empty and oversized images before calling OpenAI", async () => {
  let calls = 0;
  const service = new CnicOcrService({
    extract: async () => {
      calls += 1;
      return JSON.stringify(fictionalResult);
    },
  });

  await assert.rejects(
    service.extract({ imageBytes: new Uint8Array(), mimeType: "image/jpeg" }),
    (error) => error instanceof CnicOcrError && error.code === "INVALID_IMAGE",
  );
  await assert.rejects(
    service.extract({
      imageBytes: new Uint8Array(MAX_CNIC_IMAGE_BYTES + 1),
      mimeType: "image/jpeg",
    }),
    (error) => error instanceof CnicOcrError && error.code === "INVALID_IMAGE",
  );
  assert.equal(calls, 0);
});

test("rejects malformed or unexpected model output", async () => {
  const malformed = new CnicOcrService({ extract: async () => "not json" });
  await assert.rejects(
    malformed.extract({ imageBytes: Uint8Array.from([1]), mimeType: "image/webp" }),
    (error) =>
      error instanceof CnicOcrError && error.code === "INVALID_MODEL_RESPONSE",
  );

  const missingField = new CnicOcrService({
    extract: async () => JSON.stringify({ name: "AHSAN RAZA", cnic: null, dob: null }),
  });
  await assert.rejects(
    missingField.extract({ imageBytes: Uint8Array.from([1]), mimeType: "image/webp" }),
    (error) =>
      error instanceof CnicOcrError && error.code === "INVALID_MODEL_RESPONSE",
  );
});

test("OpenAI gateway uses GPT-4o vision, strict output, and disables storage", async () => {
  let request: Record<string, unknown> | undefined;
  const client = {
    responses: {
      create: async (body: Record<string, unknown>) => {
        request = body;
        return { output_text: JSON.stringify(fictionalResult) };
      },
    },
  } as unknown as OpenAI;

  const output = await new OpenAiCnicOcrGateway(client).extract(
    "data:image/png;base64,AQID",
  );

  assert.equal(output, JSON.stringify(fictionalResult));
  assert.equal(request?.model, "gpt-4o");
  assert.equal(request?.store, false);
  assert.equal(
    (request?.text as { format: { type: string; strict: boolean } }).format.type,
    "json_schema",
  );
  assert.equal(
    (request?.text as { format: { type: string; strict: boolean } }).format.strict,
    true,
  );
  const input = request?.input as Array<{ content: Array<Record<string, unknown>> }>;
  assert.deepEqual(input[0].content[1], {
    type: "input_image",
    image_url: "data:image/png;base64,AQID",
    detail: "high",
  });
});
