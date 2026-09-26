import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  available: "bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]",
  booked: "bg-[#EFF8FF] text-[#175CD3] ring-[#B2DDFF]",
  maintenance: "bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]",
  "out of service": "bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]",
  own: "bg-[#F2F4F7] text-[#475467] ring-[#D0D5DD]",
  managed: "bg-[#F4F3FF] text-[#5925DC] ring-[#D9D6FE]",
  confirmed: "bg-[#EFF8FF] text-[#175CD3] ring-[#B2DDFF]",
  "checked out": "bg-[#F4F3FF] text-[#5925DC] ring-[#D9D6FE]",
  completed: "bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", tones[status.toLowerCase()] ?? tones.own)}>{status}</span>;
}
