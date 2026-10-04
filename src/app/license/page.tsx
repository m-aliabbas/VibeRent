import { ShieldAlert } from "lucide-react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LicenseRefreshButton } from "@/components/auth/license-refresh-button";
import { getDesktopLicenseStatus } from "@/server/desktop/license-service";

export default function LicensePage() {
  const status = getDesktopLicenseStatus();
  return (
    <AuthFrame
      eyebrow="Desktop license"
      title="This installation needs approval"
      description="Send the device fingerprint to your VibeRent administrator. After approval, check again while connected to the internet."
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-[#93370D]">
          <ShieldAlert className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold capitalize">{status.state.replaceAll("-", " ")}</p>
            <p className="mt-1 text-sm">{status.message}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Device fingerprint</p>
          <code className="mt-2 block break-all rounded-lg bg-[#F2F4F7] p-3 text-xs text-[#344054]">{status.fingerprint}</code>
        </div>
        <details className="rounded-xl border border-[#EAECF0] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#344054]">System information sent to Firebase</summary>
          <dl className="mt-3 grid gap-2 text-xs text-[#475467]">
            {Object.entries(status.device).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[96px_1fr] gap-2">
                <dt className="font-semibold">{label}</dt>
                <dd className="break-all font-mono">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
        <LicenseRefreshButton />
        <p className="text-center text-xs text-[#667085]">Checked {new Date(status.checkedAt).toLocaleString("en-PK")}</p>
      </div>
    </AuthFrame>
  );
}
