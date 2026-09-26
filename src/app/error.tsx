"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[65vh] place-items-center text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FEF3F2] text-[#D92D20]">
          <AlertTriangle size={25} />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
          The workspace could not finish loading. Your entered data has not been
          intentionally cleared.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
