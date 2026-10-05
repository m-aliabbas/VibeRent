# CNIC OCR module

The server-only module in `src/server/cnic-ocr` sends the front and back CNIC images together to OpenAI's
Responses API using `gpt-4o` and returns this typed contract:

```ts
{
  name: string | null;
  dob: string | null;
  address: string | null;
  expiry: string | null;
  cnic_no: string | null;
}
```

Signed-in agency owners, fleet managers, and rental agents can test the module
from `/cnic-ocr`. The screen previews both selected files locally and sends them to
the authenticated Server Action only after **Analyze CNIC** is selected.

Set `OPENAI_API_KEY` only in the server environment. Do not use a
`NEXT_PUBLIC_` variable for this credential.

```ts
import { readFile } from "node:fs/promises";
import {
  createCnicOcrService,
  formatCnicOcrText,
} from "@/server/cnic-ocr";

const service = createCnicOcrService();
const [frontBytes, backBytes] = await Promise.all([
  readFile("/private/path/to/fictional-cnic-front.jpg"),
  readFile("/private/path/to/fictional-cnic-back.jpg"),
]);
const result = await service.extract({
  front: { imageBytes: frontBytes, mimeType: "image/jpeg" },
  back: { imageBytes: backBytes, mimeType: "image/jpeg" },
});

console.log(formatCnicOcrText(result));
```

The output formatter produces:

```text
name: AHSAN RAZA
dob: 01.01.1990
address: HOUSE 12, MODEL TOWN, LAHORE
expiry: 01.01.2030
cnic_no: 35202-1234567-1
```

Unreadable fields are returned as `null` and rendered as blank. Names and
addresses printed in Urdu, Arabic, or another non-Latin script are transliterated
into Latin-script English without translating their meaning. The service accepts
JPEG, PNG, WEBP, and non-animated GIF images up to 10 MiB per side. It does not
log or persist image bytes, and sends `store: false` to OpenAI. Any future HTTP
upload endpoint must add authentication, authorization, rate limiting, and
explicit retention handling for identity documents.

Before OCR, portrait CNIC scans are rotated into the card's normal landscape
orientation. The request includes the complete front and back plus an enlarged,
high-contrast crop of the back address area to improve Urdu address recognition.
