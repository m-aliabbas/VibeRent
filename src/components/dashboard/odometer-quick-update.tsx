"use client";

import { useState } from "react";
import { updateVehicleOdometerAction } from "@/app/actions/vehicles";
import { Button } from "@/components/ui/button";

type Option={id:string;label:string;lastOdometer?:number};
export function OdometerQuickUpdate({vehicles}:{vehicles:Option[]}){
  const [vehicleId,setVehicleId]=useState("");const [reading,setReading]=useState("");const [pending,setPending]=useState(false);const [message,setMessage]=useState("");const [latest,setLatest]=useState<Record<string,number>>({});
  const source=vehicles.find(item=>item.id===vehicleId);const selected=source?{...source,lastOdometer:latest[vehicleId]??source.lastOdometer}:undefined;
  return <section className="rounded-xl border border-[#E3E7ED] bg-white p-4"><h2 className="text-sm font-bold">Update odometer</h2><p className="mt-1 text-xs text-[#667085]">Choose a vehicle and record its latest reading.</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] xl:grid-cols-1"><label className="text-xs font-semibold">Vehicle<select value={vehicleId} onChange={event=>{setVehicleId(event.target.value);setReading("");setMessage("")}} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"><option value="">Select vehicle</option>{vehicles.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold">Reading (km)<input type="number" min={selected?.lastOdometer??0} value={reading} onChange={event=>setReading(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"/></label><Button disabled={pending||!selected||!reading||!Number.isSafeInteger(Number(reading))||Number(reading)<(selected.lastOdometer??0)} onClick={async()=>{setPending(true);const result=await updateVehicleOdometerAction(vehicleId,{odometer:Number(reading)});setPending(false);setMessage(result.ok?"Reading saved.":result.error.message);if(result.ok){setLatest(current=>({...current,[vehicleId]:result.data.odometer}));setReading("")}}}>{pending?"Saving…":"Save reading"}</Button></div>{selected&&<p className="mt-2 text-xs text-[#667085]">Last recorded: {selected.lastOdometer===undefined?"None":`${selected.lastOdometer.toLocaleString("en-PK")} km`}</p>}{message&&<p role="status" className="mt-2 text-xs font-semibold text-[#006FE6]">{message}</p>}</section>;
}
