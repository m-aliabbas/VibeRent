import { CheckCircle2, Info, X } from "lucide-react";
export function Toast({
  message,
  tone = "success",
  onDismiss,
}: {
  message: string;
  tone?: "success" | "info";
  onDismiss?: () => void;
}) {
  if (!message) return null;
  const Icon = tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-20 z-[60] flex max-w-[calc(100%-32px)] items-center gap-3 rounded-[10px] border border-[#ABEFC6] bg-white px-4 py-3 text-sm font-semibold text-[#067647] shadow-lg"
    >
      <Icon size={18} className="shrink-0" />
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="ml-1 grid h-7 w-7 place-items-center rounded-md hover:bg-[#ECFDF3]"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
