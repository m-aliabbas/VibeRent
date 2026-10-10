import { TriangleAlert } from "lucide-react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "@/components/auth/auth-forms";
import { getDesktopLicenseStatus } from "@/server/desktop/license-service";

function expiryMessage(daysRemaining: number) {
  if (daysRemaining === 0) return "Your software license will expire today.";
  return `Your software license will expire in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}.`;
}

export default async function SignInPage({searchParams}:{searchParams:Promise<{callbackUrl?:string;reset?:string}>}) {
  const query = await searchParams;
  const license = getDesktopLicenseStatus();
  const showExpiryReminder = license.enforced
    && license.state === "active"
    && license.daysRemaining !== undefined
    && license.daysRemaining < 3;

  return <AuthFrame eyebrow="Welcome back" title="Sign in to your agency" description="Use your verified work email to continue to VibeRent.">
    {showExpiryReminder && <div role="alert" className="mb-5 flex gap-3 rounded-xl border-2 border-[#F79009] bg-[#FFFAEB] p-4 text-[#7A2E0E] shadow-sm">
      <TriangleAlert className="mt-0.5 shrink-0 text-[#DC6803]" size={22}/>
      <div>
        <p className="font-bold">{expiryMessage(license.daysRemaining!)}</p>
        <p className="mt-1 text-sm leading-5">If you have already paid, ignore this message. Otherwise, contact Vibe.Exe.</p>
      </div>
    </div>}
    {query.reset&&<div className="mb-4 rounded-lg border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-sm text-[#067647]">Password updated. You can sign in now.</div>}
    <SignInForm callbackUrl={query.callbackUrl}/>
  </AuthFrame>;
}
