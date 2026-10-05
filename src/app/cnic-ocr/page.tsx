import { CnicOcrWorkspace } from "@/components/cnic-ocr/cnic-ocr-workspace";
import { PageHeader } from "@/components/shared/page-header";

export default function CnicOcrPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Test utility"
        title="CNIC OCR"
        description="Upload a CNIC image and test GPT-4o extraction with the configured server-side OpenAI key."
      />
      <CnicOcrWorkspace />
    </div>
  );
}
