"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { Gauge, X } from "lucide-react";
import { updateVehicleOdometerAction } from "@/app/actions/vehicles";
import { FormCombobox } from "@/components/forms/form-combobox";
import { Button } from "@/components/ui/button";

type Option = { id: string; label: string; lastOdometer?: number };

/** Header button + dialog. Stays open after saving so several cars can be logged in a row. */
export function OdometerButton({ vehicles }: { vehicles: Option[] }) {
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [reading, setReading] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();
  const [latest, setLatest] = useState<Record<string, number>>({});
  const readingRef = useRef<HTMLInputElement>(null);
  const source = vehicles.find(item => item.id === vehicleId);
  const last = source ? latest[vehicleId] ?? source.lastOdometer : undefined;
  const value = Number(reading);
  const tooLow = Boolean(reading) && last !== undefined && value < last;
  const valid = Boolean(source) && Boolean(reading) && Number.isSafeInteger(value) && value >= 0 && !tooLow;

  async function save() {
    if (!valid || pending || !source) return;
    setPending(true);
    const result = await updateVehicleOdometerAction(vehicleId, { odometer: value });
    setPending(false);
    if (!result.ok) { setMessage({ tone: "error", text: result.error.message }); return; }
    setLatest(current => ({ ...current, [vehicleId]: result.data.odometer }));
    setMessage({ tone: "ok", text: `Saved ${source.label}: ${result.data.odometer.toLocaleString("en-PK")} km` });
    setReading("");
    setVehicleId("");
  }

  return (
    <>
      <Button variant="secondary" shortcut="shift+o" onClick={() => { setMessage(undefined); setOpen(true); }}><Gauge size={17} />Update odometer</Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
          <Dialog.Content className="fixed left-1/2 top-[18vh] z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-bold">Update odometer</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#475467]">Pick a car, type the reading, press Enter. The dialog stays open for the next car.</Dialog.Description>
              </div>
              <Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F2F4F7]" aria-label="Close"><X size={18} /></Dialog.Close>
            </div>
            <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
              <FormCombobox
                label="Vehicle"
                value={vehicleId}
                onValueChange={id => { setVehicleId(id); setMessage(undefined); window.setTimeout(() => readingRef.current?.focus(), 0); }}
                options={vehicles.map(item => ({ label: item.label, value: item.id }))}
                searchPlaceholder="Search plate or model…"
              />
              <label className="block text-sm font-semibold text-[#344054]">
                Reading (km)
                <input
                  ref={readingRef}
                  type="number"
                  inputMode="numeric"
                  min={last ?? 0}
                  value={reading}
                  onChange={event => setReading(event.target.value)}
                  aria-invalid={tooLow}
                  className={`mt-1.5 block h-10 w-full rounded-[9px] border px-3 text-sm font-normal tabular-nums ${tooLow ? "border-[#F04438]" : "border-[#D0D5DD]"}`}
                />
                <span className={`mt-1 block text-xs font-normal ${tooLow ? "text-[#B42318]" : "text-[#475467]"}`}>
                  {!source ? "Choose a vehicle first." : tooLow ? `Lower than the last reading (${last!.toLocaleString("en-PK")} km).` : `Last reading: ${last === undefined ? "none recorded" : `${last.toLocaleString("en-PK")} km`}`}
                </span>
              </label>
              {message && <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${message.tone === "ok" ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#FEF3F2] text-[#B42318]"}`}>{message.text}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Done</Button>
                <Button type="submit" disabled={!valid || pending}>{pending ? "Saving…" : "Save reading"}</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
