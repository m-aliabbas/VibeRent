"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, ImagePlus, LoaderCircle, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { updateOrganizationProfileAction } from "@/app/actions/organization";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import type { OrganizationSettingsDto } from "@/server/services/organization-settings-service";

type Profile = OrganizationSettingsDto["profile"];

export function OrganizationProfile({ initial, onSaved }: { initial: Profile; onSaved: (message: string, profile: Profile) => void }) {
  const [profile, setProfile] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function update<Key extends keyof Profile>(key: Key, value: Profile[Key]) {
    setProfile(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: "" }));
  }

  function chooseLogo(file?: File) {
    if (!file) return;
    if (!(["image/png", "image/jpeg"].includes(file.type)) || file.size > 500_000) {
      setFieldErrors(current => ({ ...current, logoDataUrl: "Use a PNG or JPG logo smaller than 500 KB." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logoDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    setPending(true);
    setError("");
    setFieldErrors({});
    const result = await updateOrganizationProfileAction(profile);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    const saved = result.data ?? profile;
    setProfile(saved);
    onSaved(result.message ?? "Organization profile saved.", saved);
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <section className="rounded-xl border bg-white">
      <div className="flex gap-3 border-b p-5">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><Building2 size={19}/></span>
        <div><h2 className="font-bold">Organization profile</h2><p className="mt-1 text-xs text-[#667085]">The legal and contact identity shown across agreements, receipts, and customer documents.</p></div>
      </div>
      <div className="space-y-6 p-5">
        <div>
          <h3 className="text-sm font-bold text-[#344054]">Business identity</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormInput required label="Organization name" value={profile.name} error={fieldErrors.name} onChange={event => update("name", event.target.value)}/>
            <FormInput label="Registration number" placeholder="e.g. SECP / local registration" value={profile.registrationNumber} onChange={event => update("registrationNumber", event.target.value)}/>
            <FormInput label="Tax / NTN number" placeholder="e.g. NTN 1234567-8" value={profile.taxNumber} onChange={event => update("taxNumber", event.target.value)}/>
            <FormSelect label="Currency" disabled value={profile.currency} options={["PKR"]}/>
          </div>
        </div>
        <div className="border-t pt-5">
          <h3 className="text-sm font-bold text-[#344054]">Public contact details</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormInput label="Business phone" placeholder="+92 42 3578 1100" value={profile.phone} error={fieldErrors.phone} onChange={event => update("phone", event.target.value)}/>
            <FormInput label="Public email" type="email" placeholder="operations@example.pk" value={profile.publicEmail} error={fieldErrors.publicEmail} onChange={event => update("publicEmail", event.target.value)}/>
            <div className="sm:col-span-2"><FormInput required label="Registered address" value={profile.address} error={fieldErrors.address} onChange={event => update("address", event.target.value)}/></div>
            <FormSelect label="Time zone" disabled value={profile.timezone} options={["Asia/Karachi"]}/>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
        <div className="flex justify-end"><Button disabled={pending} onClick={() => void save()}>{pending && <LoaderCircle className="animate-spin" size={16}/>}Save organization profile</Button></div>
      </div>
    </section>

    <aside className="space-y-4">
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">Organization logo</h2>
        <p className="mt-1 text-xs text-[#667085]">PNG or JPG, up to 500 KB. A wide transparent logo works best.</p>
        <div className="mt-4 grid min-h-36 place-items-center overflow-hidden rounded-xl border border-dashed bg-[#F8FAFC] p-4">
          {profile.logoDataUrl ? <Image unoptimized src={profile.logoDataUrl} alt="Organization logo preview" width={240} height={96} className="max-h-24 max-w-full object-contain"/> : <div className="text-center text-[#98A2B3]"><ImagePlus className="mx-auto"/><p className="mt-2 text-xs">No logo uploaded</p></div>}
        </div>
        <label className="mt-3 block"><span className="sr-only">Choose organization logo</span><input className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#EFF8FF] file:px-3 file:py-2 file:font-semibold file:text-[#175CD3]" type="file" accept="image/png,image/jpeg" onChange={event => chooseLogo(event.target.files?.[0])}/></label>
        {fieldErrors.logoDataUrl && <p className="mt-2 text-xs text-[#B42318]">{fieldErrors.logoDataUrl}</p>}
      </section>
      <section className="rounded-xl border bg-[#F8FAFC] p-5">
        <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={17} className="text-[#067647]"/>Used on documents</h2>
        <div className="mt-4 space-y-3 text-sm text-[#475467]">
          <p className="flex gap-2"><Phone size={15} className="mt-0.5 shrink-0"/>{profile.phone || "Phone not set"}</p>
          <p className="flex gap-2"><Mail size={15} className="mt-0.5 shrink-0"/>{profile.publicEmail || "Email not set"}</p>
          <p className="flex gap-2"><MapPin size={15} className="mt-0.5 shrink-0"/>{profile.address || "Address not set"}</p>
        </div>
      </section>
    </aside>
  </div>;
}
