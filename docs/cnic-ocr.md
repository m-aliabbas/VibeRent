# CNIC OCR module

The server-only module in `src/server/cnic-ocr` sends a CNIC image to OpenAI's
Responses API using `gpt-4o` and returns this typed contract:

```ts
{
  name: string | null;
  cnic: string | null;
  dob: string | null;
  id_expiry: string | null;
}
```

Signed-in agency owners, fleet managers, and rental agents can test the module
from `/cnic-ocr`. The screen previews the selected file locally and sends it to
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
const imageBytes = await readFile("/private/path/to/fictional-cnic.jpg");
const result = await service.extract({ imageBytes, mimeType: "image/jpeg" });

console.log(formatCnicOcrText(result));
```

The output formatter produces:

```text
name: AHSAN RAZA
cnic: 35202-1234567-1
dob: 01.01.1990
id_expiry: 01.01.2030
```

Unreadable fields are returned as `null` and rendered as blank. The service
accepts JPEG, PNG, WEBP, and non-animated GIF images up to 10 MiB. It does not
log or persist image bytes, and sends `store: false` to OpenAI. Any future HTTP
upload endpoint must add authentication, authorization, rate limiting, and
explicit retention handling for identity documents.
