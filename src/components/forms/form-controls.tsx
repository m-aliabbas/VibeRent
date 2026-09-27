import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function FormInput({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#344054]">{label}{props.required && <span className="text-[#D92D20]"> *</span>}</span><input {...props} className={`h-11 w-full rounded-[9px] border bg-white px-3 text-sm text-[#19191F] outline-none placeholder:text-[#98A2B3] focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10 ${error ? "border-[#F04438]" : "border-[#D0D5DD]"}`} />{error && <span className="mt-1 block text-xs text-[#D92D20]">{error}</span>}</label>;
}

export function FormSelect({ label, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: Array<string | { label: string; value: string }> }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#344054]">{label}{props.required && <span className="text-[#D92D20]"> *</span>}</span><select {...props} className="h-11 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm text-[#19191F] outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10">{options.map((option) => { const item=typeof option==="string"?{label:option,value:option}:option; return <option key={item.value} value={item.value}>{item.label}</option> })}</select></label>;
}
