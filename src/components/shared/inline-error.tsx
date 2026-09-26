import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InlineError({ title = "We couldn’t load this view", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FFFBFA] px-5 py-8 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#FEF3F2] text-[#D92D20]"><AlertCircle size={22} /></span>
      <h3 className="mt-4 font-bold text-[#912018]">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#7A271A]">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}><RotateCcw size={16} />Try again</Button>}
    </div>
  );
}
