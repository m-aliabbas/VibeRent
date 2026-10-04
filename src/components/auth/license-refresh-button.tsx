"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LicenseRefreshButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/desktop/license/refresh", { method: "POST" });
      if (!response.ok) throw new Error("License verification failed.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "License verification failed.");
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" disabled={pending} onClick={() => void refresh()}>
        <RefreshCw className={pending ? "animate-spin" : ""} size={17} />
        {pending ? "Checking…" : "Check license again"}
      </Button>
      {error && <p role="alert" className="text-center text-sm text-[#B42318]">{error}</p>}
    </div>
  );
}
