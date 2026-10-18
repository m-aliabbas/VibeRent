import "server-only";

import OpenAI from "openai";

import type { CnicOcrGateway } from "./cnic-ocr-service";

const CNIC_OCR_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    father_name: { type: ["string", "null"] },
    dob: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    expiry: { type: ["string", "null"] },
    cnic_no: { type: ["string", "null"] },
  },
  required: ["name", "father_name", "dob", "address", "expiry", "cnic_no"],
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

  async extract(images: { front: string; back: string; backAddressDetail?: string }): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      instructions: [
        "You are a precise OCR extractor for Pakistani CNIC identity cards.",
        "Use the supplied front and back images together as two sides of the same card.",
        "Inspect the back image independently and carefully; the holder address is commonly printed there in two Urdu lines.",
        "Read only values visibly present on either image; never guess, infer, or complete an obscured value.",
        "Transliterate name and address into Latin-script English when printed in Urdu, Arabic, or another non-Latin script (for example, علی becomes Ali).",
        "Do not return a visible address as null merely because it is written in a non-Latin script; read all visible address lines and transliterate them.",
        "Do not translate the meaning of names or addresses, and preserve printed date formatting.",
        "Return null for any requested field that cannot be read confidently.",
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "From these front and back CNIC images, return strictly these fields when visibly available: name, father_name, dob, address, expiry, and cnic_no. The father_name field may be printed as Father Name or Husband Name. Use null for every unavailable field.",
            },
            { type: "input_text", text: "CNIC front:" },
            {
              type: "input_image",
              image_url: images.front,
              detail: "high",
            },
            { type: "input_text", text: "CNIC back:" },
            {
              type: "input_image",
              image_url: images.back,
              detail: "high",
            },
            ...(images.backAddressDetail ? [
              { type: "input_text" as const, text: "Enlarged high-contrast crop of the address area from the same CNIC back:" },
              { type: "input_image" as const, image_url: images.backAddressDetail, detail: "high" as const },
            ] : []),
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
      max_output_tokens: 1000,
    });

    return response.output_text;
  }
}
