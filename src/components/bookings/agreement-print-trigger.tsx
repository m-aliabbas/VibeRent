"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AgreementPrintTrigger() {
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    let active = true;
    async function openPrintDialog() {
      await document.fonts?.ready;
      const images = Array.from(document.images);
      await Promise.all(images.map(image => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)));
      if (active) window.print();
    }
    void openPrintDialog();
    return () => { active = false; };
  }, []);

  return <div className="print-hidden sticky top-3 z-10 mb-4 flex justify-end"><Button onClick={()=>window.print()}><Printer size={16}/>Open print dialog</Button></div>;
}
