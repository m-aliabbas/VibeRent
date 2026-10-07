"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Eye, FileImage, FileText, GripVertical, Languages, LayoutTemplate, LoaderCircle, Monitor, Palette, Plus, Save, Settings2, Smartphone, Trash2, Upload } from "lucide-react";
import { updateAgreementDesignerAction, uploadAgreementTermsImageAction } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { type AgreementDesignConfig, type AgreementSection } from "@/lib/agreement-config";
import type { OrganizationSettingsDto } from "@/server/services/organization-settings-service";

type Profile = OrganizationSettingsDto["profile"];
type EditorPanel = "style" | "content" | "terms" | "signatures";

export function AgreementDesigner({ initial, profile, onSaved }: { initial: AgreementDesignConfig; profile: Profile; onSaved: (message: string) => void }) {
  const [design, setDesign] = useState(initial);
  const [panel, setPanel] = useState<EditorPanel>("style");
  const [previewOnly, setPreviewOnly] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  function change(next: AgreementDesignConfig | ((current: AgreementDesignConfig) => AgreementDesignConfig)) {
    setDesign(next);
    setDirty(true);
    setError("");
  }

  async function save() {
    setPending(true);
    setError("");
    const result = await updateAgreementDesignerAction(design);
    setPending(false);
    if (!result.ok) { setError(result.message); return; }
    if (result.data) setDesign(result.data);
    setDirty(false);
    onSaved(result.message ?? "Agreement design saved.");
  }

  return <div className="space-y-4">
    <section className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><FileText size={19}/></span><div><h2 className="font-bold">Rental agreement designer</h2><p className="mt-1 text-xs text-[#667085]">Customize the default agreement used for future bookings and generated PDFs.</p></div></div>
      <div className="flex gap-2"><Button variant="secondary" className="lg:hidden" onClick={() => setPreviewOnly(value => !value)}>{previewOnly ? <Settings2 size={16}/> : <Eye size={16}/>} {previewOnly ? "Edit" : "Preview"}</Button><Button disabled={pending || !dirty} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" size={16}/> : <Save size={16}/>}Save design</Button></div>
    </section>
    {error && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
    <div className="grid min-h-[720px] gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
      <section className={`${previewOnly ? "hidden" : "block"} overflow-hidden rounded-xl border bg-white lg:block`}>
        <div className="grid grid-cols-4 border-b bg-[#F8FAFC] p-1.5" role="tablist" aria-label="Agreement designer controls">
          {([ ["style", Palette, "Style"], ["content", LayoutTemplate, "Sections"], ["terms", Languages, "Terms"], ["signatures", Check, "Signatures"] ] as const).map(([id, Icon, label]) => <button key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${panel === id ? "bg-white text-[#006FE6] shadow-sm" : "text-[#667085] hover:bg-white/70"}`}><Icon size={16}/>{label}</button>)}
        </div>
        <div className="max-h-[calc(100vh-260px)] min-h-[650px] overflow-y-auto p-5">
          {panel === "style" && <StylePanel design={design} change={change}/>} 
          {panel === "content" && <ContentPanel design={design} change={change}/>} 
          {panel === "terms" && <TermsPanel design={design} change={change}/>} 
          {panel === "signatures" && <SignaturePanel design={design} change={change}/>} 
        </div>
      </section>
      <section className={`${!previewOnly ? "hidden" : "block"} min-w-0 rounded-xl border bg-[#EEF2F6] lg:block`}>
        <div className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div><p className="text-sm font-bold">Live agreement preview</p><p className="text-xs text-[#667085]">Sample booking data · A4 document</p></div>
          <div className="flex rounded-lg border bg-[#F8FAFC] p-1"><button aria-label="Desktop preview" onClick={() => setPreviewWidth("desktop")} className={`grid h-8 w-8 place-items-center rounded-md ${previewWidth === "desktop" ? "bg-white text-[#006FE6] shadow-sm" : "text-[#667085]"}`}><Monitor size={15}/></button><button aria-label="Narrow preview" onClick={() => setPreviewWidth("mobile")} className={`grid h-8 w-8 place-items-center rounded-md ${previewWidth === "mobile" ? "bg-white text-[#006FE6] shadow-sm" : "text-[#667085]"}`}><Smartphone size={15}/></button></div>
        </div>
        <div className="overflow-auto p-3 sm:p-6"><div className={`mx-auto transition-[max-width] ${previewWidth === "mobile" ? "max-w-[420px]" : "max-w-[760px]"}`}><AgreementPreview design={design} profile={profile}/></div></div>
      </section>
    </div>
  </div>;
}

function StylePanel({ design, change }: DesignerProps) {
  return <div className="space-y-6">
    <ControlSection title="Document language" description="Choose what renters see on the final agreement."><div className="grid grid-cols-3 gap-2">{([ ["en", "EN", "English"], ["ur", "اردو", "Urdu"], ["bilingual", "EN / اردو", "Both"] ] as const).map(([value, short, label]) => <button key={value} onClick={() => change({ ...design, language: value })} className={`rounded-lg border p-3 text-center ${design.language === value ? "border-[#006FE6] bg-[#EFF8FF] text-[#175CD3]" : "hover:bg-[#F8FAFC]"}`}><span className="block text-sm font-bold">{short}</span><span className="mt-1 block text-[10px] text-[#667085]">{label}</span></button>)}</div></ControlSection>
    <ControlSection title="Layout preset" description="Presets change spacing and visual treatment while keeping your content."><div className="grid grid-cols-3 gap-2">{(["classic", "modern", "minimal"] as const).map(value => <button key={value} onClick={() => change({ ...design, template: value })} className={`rounded-lg border p-2 ${design.template === value ? "border-[#006FE6] bg-[#EFF8FF]" : "hover:bg-[#F8FAFC]"}`}><span className={`mx-auto block h-14 rounded border bg-white ${value === "modern" ? "border-t-8" : value === "classic" ? "border-4 border-double" : "border-x-0 border-b-0 border-t-2"}`} style={{ borderColor: design.template === value ? design.accentColor : "#D0D5DD" }}/><span className="mt-2 block text-xs font-semibold capitalize">{value}</span></button>)}</div></ControlSection>
    <ControlSection title="Brand color" description="Used for headings, rules, and highlighted totals."><div className="flex flex-wrap gap-2">{["#006FE6", "#0F766E", "#7C3AED", "#B54708", "#19191F"].map(color => <button key={color} aria-label={`Use ${color}`} onClick={() => change({ ...design, accentColor: color })} className={`grid h-9 w-9 place-items-center rounded-full border-2 ${design.accentColor === color ? "border-[#19191F]" : "border-white shadow"}`} style={{ backgroundColor: color }}>{design.accentColor === color && <Check size={15} className="text-white"/>}</button>)}<label className="grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full border bg-white"><input type="color" className="h-12 w-12 cursor-pointer border-0 p-0" value={design.accentColor} onChange={event => change({ ...design, accentColor: event.target.value.toUpperCase() })}/></label></div></ControlSection>
    <ControlSection title="Typography and spacing"><div className="grid grid-cols-2 gap-2">{(["comfortable", "compact"] as const).map(value => <button key={value} onClick={() => change({ ...design, density: value })} className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize ${design.density === value ? "border-[#006FE6] bg-[#EFF8FF] text-[#175CD3]" : ""}`}>{value}</button>)}</div></ControlSection>
    <ControlSection title="Document details"><div className="space-y-2"><Toggle checked={design.showLogo} onChange={checked => change({ ...design, showLogo: checked })} label="Show organization logo"/><Toggle checked={design.showPageBorder} onChange={checked => change({ ...design, showPageBorder: checked })} label="Show page border"/><Toggle checked={design.showRegistration} onChange={checked => change({ ...design, showRegistration: checked })} label="Show registration and NTN"/></div></ControlSection>
  </div>;
}

function ContentPanel({ design, change }: DesignerProps) {
  function updateSection(index: number, patch: Partial<AgreementSection>) { change({ ...design, sections: design.sections.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }); }
  function move(index: number, direction: -1 | 1) { const next = [...design.sections]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; change({ ...design, sections: next }); }
  return <div className="space-y-6">
    <ControlSection title="Document titles"><div className="space-y-3"><TextField label="English title" value={design.titleEn} onChange={value => change({ ...design, titleEn: value })}/><TextField label="Urdu title" value={design.titleUr} dir="rtl" onChange={value => change({ ...design, titleUr: value })}/></div></ControlSection>
    <ControlSection title="Sections" description="Reorder sections, hide optional content, or rename headings."><div className="space-y-2">{design.sections.map((section, index) => <SectionEditor key={section.id} section={section} first={index === 0} last={index === design.sections.length - 1} onMove={direction => move(index, direction)} onUpdate={patch => updateSection(index, patch)}/>)}</div></ControlSection>
    <ControlSection title="Footer message"><div className="space-y-3"><TextField label="English footer" value={design.footerEn} onChange={value => change({ ...design, footerEn: value })}/><TextField label="Urdu footer" value={design.footerUr} dir="rtl" onChange={value => change({ ...design, footerUr: value })}/></div></ControlSection>
  </div>;
}

function TermsPanel({ design, change }: DesignerProps) {
  const [language, setLanguage] = useState<"en" | "ur">(design.termsLanguage);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const terms = language === "en" ? design.termsEn : design.termsUr;
  const key = language === "en" ? "termsEn" : "termsUr";
  function setTerms(next: string[]) { change({ ...design, [key]: next }); }
  function move(index: number, direction: -1 | 1) { const next = [...terms]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setTerms(next); }
  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadAgreementTermsImageAction(formData);
    setUploading(false);
    if (!result.ok || !result.data) { setUploadError(result.message ?? "The image could not be uploaded."); return; }
    change({ ...design, termsSource: "image", termsImage: result.data });
  }
  return <div className="space-y-5">
    <ControlSection title="Terms format" description="Use editable written clauses or upload a clear photo of terms prepared elsewhere."><div className="grid grid-cols-2 gap-2">{([ ["text", FileText, "Written terms"], ["image", FileImage, "Terms image"] ] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => change({ ...design, termsSource: value })} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${design.termsSource === value ? "border-[#006FE6] bg-[#EFF8FF] text-[#175CD3]" : "hover:bg-[#F8FAFC]"}`}><Icon size={19}/>{label}</button>)}</div></ControlSection>
    {design.termsSource === "image" ? <div className="space-y-4">
      <div className="rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] p-4 text-xs leading-5 text-[#175CD3]">The uploaded image replaces both English and Urdu clauses. It is placed inside the same Terms section and scaled across the available document width.</div>
      {design.termsImage ? <div className="overflow-hidden rounded-xl border bg-[#F8FAFC]"><Image unoptimized src={design.termsImage.url} alt="Uploaded terms and conditions" width={720} height={360} className="max-h-64 w-full object-contain"/><div className="flex items-center justify-between gap-3 border-t bg-white p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{design.termsImage.name}</p><p className="mt-0.5 text-[11px] text-[#667085]">Private agreement image</p></div><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[#344054] hover:bg-[#F8FAFC]"><Upload size={14}/>{uploading ? "Uploading…" : "Replace"}<input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={uploading} onChange={event => void uploadImage(event.target.files?.[0])}/></label></div></div> : <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#B2DDFF] bg-[#F8FAFC] p-5 text-center hover:bg-[#EFF8FF]"><Upload size={24} className="text-[#006FE6]"/><span className="mt-3 text-sm font-bold">Upload terms image</span><span className="mt-1 text-xs text-[#667085]">JPG or PNG, up to 8 MB. A sharp landscape image fits one page best.</span><input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={uploading} onChange={event => void uploadImage(event.target.files?.[0])}/>{uploading && <span className="mt-3 inline-flex items-center gap-2 text-xs text-[#175CD3]"><LoaderCircle size={14} className="animate-spin"/>Uploading…</span>}</label>}
      {uploadError && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-xs text-[#B42318]">{uploadError}</p>}
    </div> : <>
      <ControlSection title="Printed terms language" description="Each renter agreement prints the written terms in one language only."><div className="grid grid-cols-2 gap-2">{([ ["en", "English"], ["ur", "اردو"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => change({ ...design, termsLanguage: value })} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${design.termsLanguage === value ? "border-[#006FE6] bg-[#EFF8FF] text-[#175CD3]" : "hover:bg-[#F8FAFC]"}`}>{label}</button>)}</div></ControlSection>
      <div className="grid grid-cols-2 rounded-lg bg-[#F2F4F7] p-1"><button type="button" onClick={() => setLanguage("en")} className={`rounded-md px-3 py-2 text-xs font-semibold ${language === "en" ? "bg-white text-[#006FE6] shadow-sm" : "text-[#667085]"}`}>English clauses</button><button type="button" onClick={() => setLanguage("ur")} className={`rounded-md px-3 py-2 text-xs font-semibold ${language === "ur" ? "bg-white text-[#006FE6] shadow-sm" : "text-[#667085]"}`}>اردو شرائط</button></div>
      <p className="text-xs leading-5 text-[#667085]">Each item becomes a numbered clause. Reorder them to control the final agreement.</p>
      <div className="space-y-3">{terms.map((term, index) => <div key={`${language}-${index}`} className="rounded-xl border p-3"><div className="mb-2 flex items-center justify-between"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#EFF8FF] text-xs font-bold text-[#175CD3]">{index + 1}</span><div className="flex"><IconButton label="Move clause up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14}/></IconButton><IconButton label="Move clause down" disabled={index === terms.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14}/></IconButton><IconButton label="Delete clause" disabled={terms.length === 1} danger onClick={() => setTerms(terms.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14}/></IconButton></div></div><textarea dir={language === "ur" ? "rtl" : "ltr"} aria-label={`${language === "ur" ? "Urdu" : "English"} clause ${index + 1}`} className="min-h-24 w-full resize-y rounded-lg border border-[#D0D5DD] p-3 text-sm leading-6 outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={term} onChange={event => setTerms(terms.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/></div>)}</div>
      <Button variant="secondary" className="w-full" onClick={() => setTerms([...terms, language === "ur" ? "نئی شرط یہاں لکھیں۔" : "Enter a new rental condition."])}><Plus size={15}/>Add {language === "ur" ? "Urdu" : "English"} clause</Button>
    </>}
  </div>;
}

function SignaturePanel({ design, change }: DesignerProps) {
  return <div className="space-y-6"><ControlSection title="Signature blocks" description="Choose who must sign the printed agreement."><div className="space-y-2"><Toggle checked={design.signatures.customer} onChange={customer => change({ ...design, signatures: { ...design.signatures, customer } })} label="Customer / renter signature"/><Toggle checked={design.signatures.representative} onChange={representative => change({ ...design, signatures: { ...design.signatures, representative } })} label="Agency representative"/><Toggle checked={design.signatures.witness} onChange={witness => change({ ...design, signatures: { ...design.signatures, witness } })} label="Witness signature"/></div></ControlSection><div className="rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] p-4 text-xs leading-5 text-[#175CD3]">Signature blocks are included on printed and PDF agreements. Digital e-signature capture remains a separate workflow.</div></div>;
}

function AgreementPreview({ design, profile }: { design: AgreementDesignConfig; profile: Profile }) {
  const enabledSections = useMemo(() => design.sections.filter(section => section.enabled), [design.sections]);
  const bilingual = design.language === "bilingual";
  const showEnglish = design.language !== "ur";
  const showUrdu = design.language !== "en";
  const compact = design.density === "compact";
  return <article className={`relative aspect-[210/297] min-h-[720px] overflow-hidden bg-white shadow-xl ${design.showPageBorder ? "border-[6px]" : "border"}`} style={{ borderColor: design.showPageBorder ? `${design.accentColor}18` : "#E4E7EC", fontFamily: "Inter, ui-sans-serif, sans-serif" }}>
    <div className={`${compact ? "p-6" : "p-8 sm:p-10"} text-[10px] text-[#344054]`}>
      <header className={`${design.template === "classic" ? "border-b-4 border-double pb-4 text-center" : design.template === "modern" ? "border-b-2 pb-4" : "border-b pb-4"}`} style={{ borderColor: design.accentColor }}>
        <div className={`flex gap-4 ${design.template === "classic" ? "flex-col items-center" : "items-start"}`}>
          {design.showLogo && <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-[#F8FAFC]">{profile.logoDataUrl ? <Image unoptimized src={profile.logoDataUrl} alt="" width={72} height={48} className="max-h-12 max-w-[72px] object-contain"/> : <BuildingMark name={profile.name}/>}</div>}
          <div className={`min-w-0 flex-1 ${design.template === "classic" ? "text-center" : ""}`}><h1 className="truncate text-lg font-extrabold text-[#19191F]">{profile.name}</h1><p className="mt-1 text-[9px] text-[#667085]">{profile.address}</p><p className="mt-0.5 text-[9px] text-[#667085]">{[profile.phone, profile.publicEmail].filter(Boolean).join(" · ")}</p>{design.showRegistration && (profile.registrationNumber || profile.taxNumber) && <p className="mt-1 text-[8px] text-[#98A2B3]">{[profile.registrationNumber, profile.taxNumber].filter(Boolean).join(" · ")}</p>}</div>
          <div className="shrink-0 text-right"><p className="font-bold" style={{ color: design.accentColor }}>Booking #1048</p><p className="mt-1 text-[8px] text-[#667085]">05 Oct 2026</p></div>
        </div>
        <div className={`mt-4 ${bilingual ? "grid grid-cols-2 items-end gap-4" : ""}`}><>{showEnglish && <h2 className="text-left text-base font-extrabold" style={{ color: design.accentColor }}>{design.titleEn}</h2>}</><>{showUrdu && <h2 dir="rtl" className="text-right text-lg font-bold" style={{ color: design.accentColor, fontFamily: '"Noto Nastaliq Urdu", serif' }}>{design.titleUr}</h2>}</></div>
      </header>
      <div className={compact ? "mt-3 space-y-3" : "mt-5 space-y-4"}>{enabledSections.map(section => <PreviewSection key={section.id} section={section} design={design}/>)}</div>
      <footer className="absolute inset-x-8 bottom-5 border-t pt-2 text-center text-[8px] text-[#667085]">{showEnglish && <span>{design.footerEn}</span>}{bilingual && <span> · </span>}{showUrdu && <span dir="rtl" style={{ fontFamily: '"Noto Nastaliq Urdu", serif' }}>{design.footerUr}</span>}<span className="mt-1 block text-[7px] text-[#98A2B3]">Generated by VibeRent</span></footer>
    </div>
  </article>;
}

function PreviewSection({ section, design }: { section: AgreementSection; design: AgreementDesignConfig }) {
  const bilingual = design.language === "bilingual"; const showEnglish = design.language !== "ur"; const showUrdu = design.language !== "en";
  const sectionEnglish = section.id === "terms" && design.termsSource === "text" ? design.termsLanguage === "en" : showEnglish;
  const sectionUrdu = section.id === "terms" && design.termsSource === "text" ? design.termsLanguage === "ur" : showUrdu;
  return <section><div className={`mb-2 flex items-center gap-2 ${bilingual ? "justify-between" : ""}`}><>{sectionEnglish && <h3 className="font-extrabold uppercase tracking-wide" style={{ color: design.accentColor }}>{section.titleEn}</h3>}</><span className="h-px flex-1" style={{ backgroundColor: `${design.accentColor}35` }}/>{sectionUrdu && <h3 dir="rtl" className="text-xs font-bold" style={{ color: design.accentColor, fontFamily: '"Noto Nastaliq Urdu", serif' }}>{section.titleUr}</h3>}</div><PreviewSectionBody id={section.id} design={design}/></section>;
}

function PreviewSectionBody({ id, design }: { id: AgreementSection["id"]; design: AgreementDesignConfig }) {
  if (id === "terms") {
    if (design.termsSource === "image" && design.termsImage) return <div className="overflow-hidden rounded border bg-[#F8FAFC]"><Image unoptimized src={design.termsImage.url} alt="Terms and conditions" width={720} height={320} className="max-h-52 w-full object-contain"/></div>;
    return design.termsLanguage === "ur" ? <ol dir="rtl" className="space-y-1 pr-4 text-right text-[8px] leading-4" style={{ fontFamily: '"Noto Nastaliq Urdu", serif' }}>{design.termsUr.slice(0, 8).map((term, index) => <li key={index} className="list-decimal">{term}</li>)}</ol> : <ol className="space-y-1 pl-4 text-[8px] leading-3">{design.termsEn.slice(0, 8).map((term, index) => <li key={index} className="list-decimal">{term}</li>)}</ol>;
  }
  if (id === "signatures") { const labels = [design.signatures.customer && ["Customer / Renter", "کرایہ دار"], design.signatures.representative && ["Agency representative", "ادارے کا نمائندہ"], design.signatures.witness && ["Witness", "گواہ"]].filter(Boolean) as string[][]; return <div className={`grid gap-5 pt-5 ${labels.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{labels.map(([en, ur]) => <div key={en} className="border-t border-[#98A2B3] pt-2"><span>{design.language !== "ur" && en}</span>{design.language === "bilingual" && " / "}<span dir="rtl" style={{ fontFamily: '"Noto Nastaliq Urdu", serif' }}>{design.language !== "en" && ur}</span><p className="mt-1 text-[7px] text-[#98A2B3]">Date / تاریخ: __________</p></div>)}</div>; }
  const data: Record<Exclude<AgreementSection["id"], "terms" | "signatures">, Array<[string, string, string]>> = {
    rental: [["Pickup", "06 Oct 2026, 10:00", "روانگی"], ["Return", "09 Oct 2026, 10:00", "واپسی"], ["Destination", "Islamabad", "منزل"], ["Rental type", "Self drive", "کرایہ کی قسم"]],
    renter: [["Name", "Ahsan Raza", "نام"], ["Father name", "Raza Ahmed", "والد کا نام"], ["Initial odometer", "38,420 km", "ابتدائی اوڈومیٹر"], ["Phone", "+92 300 123 4567", "فون"]],
    vehicle: [["Vehicle", "Toyota Corolla 2023", "گاڑی"], ["Registration", "LEB-2481", "رجسٹریشن"], ["Chassis", "JTDBR32E••••4812", "چیسز"], ["Fuel", "Full", "ایندھن"]],
    charges: [["Daily rate", "PKR 12,500", "یومیہ کرایہ"], ["Rental days", "3", "دن"], ["Deposit", "PKR 25,000", "ضمانت"], ["Total", "PKR 37,500", "کل رقم"]],
  };
  return <div className="grid grid-cols-3 gap-x-3 gap-y-1 rounded-lg bg-[#F8FAFC] p-2.5 text-[8px] leading-[1.15]">{data[id].map(([label, value, urdu]) => <div key={label} className="min-w-0 border-b border-[#EAECF0] pb-1"><span className="text-[7px] text-[#667085]">{design.language !== "ur" ? label : urdu}</span>{design.language === "bilingual" && <span dir="rtl" className="ml-1 text-[7px] text-[#98A2B3]">/ {urdu}</span>}<p className="mt-0.5 truncate font-bold text-[#19191F]">{value}</p></div>)}</div>;
}

type DesignerProps = { design: AgreementDesignConfig; change: (next: AgreementDesignConfig | ((current: AgreementDesignConfig) => AgreementDesignConfig)) => void };
function ControlSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section><h3 className="text-sm font-bold text-[#344054]">{title}</h3>{description && <p className="mt-1 text-xs leading-5 text-[#667085]">{description}</p>}<div className="mt-3">{children}</div></section>; }
function TextField({ label, value, dir = "ltr", onChange }: { label: string; value: string; dir?: "ltr" | "rtl"; onChange: (value: string) => void }) { return <label className="block text-xs font-semibold text-[#475467]">{label}<input dir={dir} className="mt-1.5 h-10 w-full rounded-lg border border-[#D0D5DD] px-3 text-sm outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={value} onChange={event => onChange(event.target.value)}/></label>; }
function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) { return <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 text-sm"><span>{label}</span><input type="checkbox" className="peer sr-only" checked={checked} onChange={event => onChange(event.target.checked)}/><span className="relative h-6 w-11 rounded-full bg-[#D0D5DD] transition peer-checked:bg-[#006FE6] after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"/></label>; }
function IconButton({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-md disabled:opacity-30 ${danger ? "text-[#B42318] hover:bg-[#FEF3F2]" : "text-[#667085] hover:bg-[#F2F4F7]"}`}>{children}</button>; }
function SectionEditor({ section, first, last, onMove, onUpdate }: { section: AgreementSection; first: boolean; last: boolean; onMove: (direction: -1 | 1) => void; onUpdate: (patch: Partial<AgreementSection>) => void }) { const [open, setOpen] = useState(false); const locked = section.id === "terms"; return <div className="rounded-lg border"><div className="flex items-center gap-1 p-2"><GripVertical size={15} className="text-[#98A2B3]"/><button className="min-w-0 flex-1 text-left" onClick={() => setOpen(value => !value)}><span className="block truncate text-xs font-semibold">{section.titleEn}</span><span dir="rtl" className="block truncate text-[10px] text-[#667085]">{section.titleUr}</span></button><IconButton label="Move section up" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={13}/></IconButton><IconButton label="Move section down" disabled={last} onClick={() => onMove(1)}><ArrowDown size={13}/></IconButton><input aria-label={`Show ${section.titleEn}`} title={locked ? "Terms section is required" : undefined} disabled={locked} type="checkbox" checked={section.enabled} onChange={event => onUpdate({ enabled: event.target.checked })}/><button aria-label="Edit section titles" className="grid h-8 w-8 place-items-center" onClick={() => setOpen(value => !value)}>{open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button></div>{open && <div className="space-y-3 border-t bg-[#F8FAFC] p-3"><TextField label="English heading" value={section.titleEn} onChange={titleEn => onUpdate({ titleEn })}/><TextField label="Urdu heading" value={section.titleUr} dir="rtl" onChange={titleUr => onUpdate({ titleUr })}/></div>}</div>; }
function BuildingMark({ name }: { name: string }) { return <span className="text-center text-[8px] font-extrabold text-[#667085]">{name.split(" ").map(word => word[0]).join("").slice(0, 3).toUpperCase()}</span>; }
