import "server-only";

import OpenAI from "openai";

import type { CnicOcrGateway } from "./cnic-ocr-service";

const CNIC_OCR_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    cnic: { type: ["string", "null"] },
    dob: { type: ["string", "null"] },
    id_expiry: { type: ["string", "null"] },
  },
  required: ["name", "cnic", "dob", "id_expiry"],
  additionalProperties: false,
} as const;

export type OpenAiCnicOcrGatewayOptions = {
  model?: string;
};

export class OpenAiCnicOcrGateway implements CnicOcrGateway {
  private readonly model: string;

  constructor(
    private readonly client: OpenAI,
    options: OpenAiCnicOcrGatewayOptions = {},
  ) {
    this.model = options.model ?? "gpt-4o";
  }

  async extract(imageDataUrl: string): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      instructions: [
        "You are a precise OCR extractor for Pakistani CNIC identity cards.",
        "Read only text that is visibly present on the supplied card image.",
        "Do not guess, infer, translate, or complete a partially obscured value.",
        "Preserve the printed spelling and date formatting.",
        "Return null for any requested field that cannot be read confidently.",
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract name, CNIC number, date of birth, and identity-card expiry date from this CNIC image.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cnic_ocr",
          description: "Visible identity fields extracted from a Pakistani CNIC.",
          strict: true,
          schema: CNIC_OCR_SCHEMA,
        },
      },
      max_output_tokens: 300,
    });

    return response.output_text;
  }
}
