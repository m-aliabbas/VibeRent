"use client";

import { useSyncExternalStore } from "react";
import { comboLabel } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** Keyboard hint. Renders on the client only, so Mac/PC labels never mismatch during hydration. */
export function Kbd({ combo, tone = "default", className }: { combo: string; tone?: "default" | "onPrimary"; className?: string }) {
  const keys = useSyncExternalStore(subscribe, () => comboLabel(combo).join("\u0000"), () => "");
  if (!keys) return null;
  return (
    <span aria-hidden="true" className={cn("hidden items-center gap-0.5 lg:inline-flex", className)}>
      {keys.split("\u0000").map((key, index) =>
        key === "then" ? (
          <span key={index} className={cn("px-0.5 text-[11px] font-medium", tone === "onPrimary" ? "text-white/80" : "text-[#667085]")}>then</span>
        ) : (
          <kbd
            key={index}
            className={cn(
              "inline-grid h-5 min-w-5 place-items-center rounded-[5px] border px-1 font-sans text-xs font-semibold leading-none",
              tone === "onPrimary" ? "border-white/35 bg-white/15 text-white" : "border-[#D0D5DD] bg-[#F8FAFC] text-[#475467]",
            )}
          >
            {key}
          </kbd>
        ),
      )}
    </span>
  );
}
