import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import sharp from "sharp";
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
  father_name: "RAZA AHMED",
  dob: "01.01.1990",
  address: "HOUSE 12, MODEL TOWN, LAHORE",
  expiry: "01.01.2030",
  cnic_no: "35202-1234567-1",
};

test("converts both image sides to data URLs and parses the OCR contract", async () => {
  let receivedImages: { front: string; back: string } | undefined;
  const gateway: CnicOcrGateway = {
    extract: async (images) => {
      receivedImages = images;
      return JSON.stringify({ ...fictionalResult, name: "  AHSAN RAZA  " });
    },
  };

  const result = await new CnicOcrService(gateway).extract({
    front: { imageBytes: Uint8Array.from([1, 2, 3]), mimeType: "image/jpeg" },
    back: { imageBytes: Uint8Array.from([4, 5, 6]), mimeType: "image/png" },
  });

  assert.deepEqual(receivedImages, {
    front: "data:image/jpeg;base64,AQID",
    back: "data:image/png;base64,BAUG",
  });
  assert.deepEqual(result, fictionalResult);
});

test("rotates portrait CNIC scans into landscape before sending them", async () => {
  const portrait = await sharp({
    create: { width: 20, height: 40, channels: 3, background: "white" },
  }).jpeg().toBuffer();
  let receivedFront = "";
  const service = new CnicOcrService({
    extract: async images => {
      receivedFront = images.front;
      return JSON.stringify(fictionalResult);
    },
  });

  await service.extract({
    front: { imageBytes: portrait, mimeType: "image/jpeg" },
    back: { imageBytes: portrait, mimeType: "image/jpeg" },
  });

  const normalized = Buffer.from(receivedFront.split(",")[1], "base64");
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.width, 40);
  assert.equal(metadata.height, 20);
});

test("formats the exact text contract", () => {
  assert.equal(
    formatCnicOcrText(fictionalResult),
    [
      "name: AHSAN RAZA",
      "father_name: RAZA AHMED",
      "dob: 01.01.1990",
      "address: HOUSE 12, MODEL TOWN, LAHORE",
      "expiry: 01.01.2030",
      "cnic_no: 35202-1234567-1",
    ].join("\n"),
  );
});

test("keeps unreadable fields null and renders them as blank text", async () => {
  const service = new CnicOcrService({
    extract: async () =>
      JSON.stringify({ name: "AHSAN RAZA", father_name: null, dob: null, address: null, expiry: null, cnic_no: null }),
  });

  const result = await service.extract({
    front: { imageBytes: Uint8Array.from([1]), mimeType: "image/png" },
    back: { imageBytes: Uint8Array.from([2]), mimeType: "image/png" },
  });

  assert.equal(result.cnic_no, null);
  assert.match(formatCnicOcrText(result), /^cnic_no: $/m);
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
    service.extract({ front: { imageBytes: new Uint8Array(), mimeType: "image/jpeg" }, back: { imageBytes: Uint8Array.from([1]), mimeType: "image/jpeg" } }),
    (error) => error instanceof CnicOcrError && error.code === "INVALID_IMAGE",
  );
  await assert.rejects(
    service.extract({
      front: { imageBytes: Uint8Array.from([1]), mimeType: "image/jpeg" },
      back: { imageBytes: new Uint8Array(MAX_CNIC_IMAGE_BYTES + 1), mimeType: "image/jpeg" },
    }),
    (error) => error instanceof CnicOcrError && error.code === "INVALID_IMAGE",
  );
  assert.equal(calls, 0);
});

test("rejects malformed or unexpected model output", async () => {
  const malformed = new CnicOcrService({ extract: async () => "not json" });
  await assert.rejects(
    malformed.extract({ front: { imageBytes: Uint8Array.from([1]), mimeType: "image/webp" }, back: { imageBytes: Uint8Array.from([2]), mimeType: "image/webp" } }),
    (error) =>
      error instanceof CnicOcrError && error.code === "INVALID_MODEL_RESPONSE",
  );

  const missingField = new CnicOcrService({
    extract: async () => JSON.stringify({ name: "AHSAN RAZA", father_name: null, dob: null, address: null, expiry: null }),
  });
  await assert.rejects(
    missingField.extract({ front: { imageBytes: Uint8Array.from([1]), mimeType: "image/webp" }, back: { imageBytes: Uint8Array.from([2]), mimeType: "image/webp" } }),
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

  const output = await new OpenAiCnicOcrGateway(client).extract({
    front: "data:image/png;base64,AQID",
    back: "data:image/jpeg;base64,BAUG",
  });

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
  assert.deepEqual(input[0].content[2], {
    type: "input_image",
    image_url: "data:image/png;base64,AQID",
    detail: "high",
  });
  assert.deepEqual(input[0].content[4], {
    type: "input_image",
    image_url: "data:image/jpeg;base64,BAUG",
    detail: "high",
  });
  assert.match(String(request?.instructions), /Transliterate name and address/);
  assert.match(String(request?.instructions), /holder address is commonly printed there/);
});
