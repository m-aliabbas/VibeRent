import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="grid min-h-[65vh] place-items-center text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#EFF8FF] text-[#006FE6]">
          <MapPinOff size={25} />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Page not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
          This record may have moved, been archived, or the address may be
          incorrect.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Return to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
