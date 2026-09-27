import Link from "next/link";
import { CarFront, CheckCircle2, ShieldCheck } from "lucide-react";

export function AuthFrame({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F8FAFC] lg:grid lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden min-h-screen overflow-hidden bg-[#071A35] p-12 text-white lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-3 text-xl font-extrabold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#006FE6]"><CarFront size={22}/></span>VibeRent</Link>
        <div className="my-auto max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#7DB9FF]">Rental operations, together</p>
          <h2 className="mt-5 text-5xl font-extrabold leading-[1.08] tracking-[-.045em]">One secure workspace for your entire rental team.</h2>
          <div className="mt-10 grid gap-4 text-sm text-[#D5E7FF]">
            <p className="flex items-center gap-3"><CheckCircle2 className="text-[#55D187]"/>Agency-isolated vehicles, bookings, and finance</p>
            <p className="flex items-center gap-3"><CheckCircle2 className="text-[#55D187]"/>Roles and branch access for every staff member</p>
            <p className="flex items-center gap-3"><ShieldCheck className="text-[#55D187]"/>Verified email, secure sessions, and audit history</p>
          </div>
        </div>
        <p className="text-xs text-[#91A9C7]">Built for Pakistani rental agencies · PKR · Asia/Karachi</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[460px]">
          <Link href="/" className="mb-10 flex items-center gap-2 text-lg font-extrabold text-[#0B1633] lg:hidden"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#006FE6] text-white"><CarFront size={20}/></span>VibeRent</Link>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#006FE6]">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-[#19191F]">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#667085]">{description}</p>
          <div className="mt-8 rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,.07)] sm:p-7">{children}</div>
        </div>
      </section>
    </main>
  );
}
