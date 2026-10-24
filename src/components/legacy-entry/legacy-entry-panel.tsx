"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/utils";
import { saveVehicleAction } from "@/app/actions/vehicles";
import { createCustomerAction } from "@/app/actions/customers";
import { saveOwnerAction } from "@/app/actions/owners";
import { saveDriverAction } from "@/app/actions/drivers";
import { saveGuarantorAction } from "@/app/actions/guarantors";
import { recordLegacyBookingAction } from "@/app/actions/legacy-entry";
import type { Vehicle } from "@/types/vehicle";
import type { OwnerListItem } from "@/server/services/owner-service";

type Customer = {id:string;name:string;phone:string;cnic:string;status:string};
type Tab = "booking"|"vehicle"|"customer"|"owner"|"driver"|"guarantor";
const tabs: Array<{id:Tab;label:string}> = [{id:"booking",label:"Booking"},{id:"vehicle",label:"Vehicle"},{id:"customer",label:"Customer"},{id:"owner",label:"Owner"},{id:"driver",label:"Driver"},{id:"guarantor",label:"Guarantor"}];
const emptyBooking=()=>({vehicleId:"",customerId:"",pickupAt:"",returnAt:"",totalAmount:"",receivedAmount:"",paymentMethod:"Cash",expenseAmount:"",expenseCategory:"",expenseDescription:""});

export function LegacyEntryPanel({initialVehicles,initialCustomers,initialOwners,cities,categories}:{initialVehicles:Vehicle[];initialCustomers:Customer[];initialOwners:OwnerListItem[];cities:string[];categories:string[]}) {
  const router=useRouter();
  const [tab,setTab]=useState<Tab>("booking");
  const [vehicles,setVehicles]=useState(initialVehicles);
  const [customers,setCustomers]=useState(initialCustomers);
  const [owners,setOwners]=useState(initialOwners);
  const [booking,setBooking]=useState(emptyBooking);
  const [showExpense,setShowExpense]=useState(false);
  const [bookingStage,setBookingStage]=useState(0);
  const [vehicle,setVehicle]=useState({plate:"",chassisNumber:"",engineNumber:"",make:"",model:"",year:String(new Date().getFullYear()),category:"Sedan" as Vehicle["category"],city:cities[0]??"",ownership:"Own" as Vehicle["ownership"],ownerId:"",dailyRate:"",withDriverRate:"",color:"",transmission:"Automatic" as Vehicle["transmission"],fuel:"Petrol" as Vehicle["fuel"]});
  const [customer,setCustomer]=useState({name:"",phone:"",cnic:""});
  const [owner,setOwner]=useState({name:"",phone:"",email:""});
  const [driver,setDriver]=useState({name:"",phone:"",cnic:"",address:"",licenseNumber:""});
  const [guarantor,setGuarantor]=useState({name:"",parentage:"",cnic:"",phone:"",address:"",carAmount:""});
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const outstanding=Math.max(0,Number(booking.totalAmount||0)-Number(booking.receivedAmount||0));
  const switchTab=(next:Tab)=>{setTab(next);setError("");setNotice("")};
  async function submit() {
    setPending(true);setError("");setNotice("");
    try {
      if(tab==="booking") {
        const result=await recordLegacyBookingAction({vehicleId:booking.vehicleId,customerId:booking.customerId,pickupAt:booking.pickupAt?new Date(booking.pickupAt).toISOString():"",returnAt:booking.returnAt?new Date(booking.returnAt).toISOString():"",totalAmount:booking.totalAmount.trim()?Number(booking.totalAmount):-1,receivedAmount:Number(booking.receivedAmount||0),paymentMethod:booking.paymentMethod,expense:booking.expenseAmount||booking.expenseCategory||booking.expenseDescription?{amount:Number(booking.expenseAmount),category:booking.expenseCategory,description:booking.expenseDescription}:undefined});
        if(!result.ok){setError(result.error.message);return}
        setBooking(emptyBooking());setShowExpense(false);setBookingStage(0);setNotice(`Booking #${result.data.publicNumber} imported. Payment and expense are in the ledger.`);router.refresh();return;
      }
      if(tab==="vehicle") {
        const dailyRate=Number(vehicle.dailyRate);
        const result=await saveVehicleAction({id:"",plate:vehicle.plate,chassisNumber:vehicle.chassisNumber,engineNumber:vehicle.engineNumber,make:vehicle.make,model:vehicle.model,year:Number(vehicle.year),category:vehicle.category,city:vehicle.city,ownership:vehicle.ownership,status:"Available",dailyRate,withDriverRate:Number(vehicle.withDriverRate||vehicle.dailyRate),color:vehicle.color,transmission:vehicle.transmission,fuel:vehicle.fuel,ownerId:vehicle.ownership==="Managed"?vehicle.ownerId:undefined});
        if(!result.ok){setError(result.error.message);return}
        setVehicles(current=>[...current,result.data]);setBooking(current=>({...current,vehicleId:result.data.id}));setTab("booking");setBookingStage(1);setNotice(`${result.data.make} ${result.data.model} added to this booking.`);return;
      }
      if(tab==="customer") {
        const result=await createCustomerAction(customer);
        if(!result.ok){setError(result.error.message);return}
        setCustomers(current=>[...current,result.data]);setBooking(current=>({...current,customerId:result.data.id}));setCustomer({name:"",phone:"",cnic:""});setTab("booking");setBookingStage(2);setNotice(`${result.data.name} added to this booking.`);return;
      }
      if(tab==="owner") {
        const result=await saveOwnerAction(owner);
        if(!result.ok){setError(result.error.message);return}
        setOwners(current=>[...current,result.data]);setVehicle(current=>({...current,ownership:"Managed",ownerId:result.data.id}));setOwner({name:"",phone:"",email:""});setTab("vehicle");setNotice(`${result.data.name} added. Assign them to the vehicle.`);return;
      }
      if(tab==="driver") {
        const result=await saveDriverAction({...driver,id:"",licenseExpiresAt:null,status:"active"});
        if(!result.ok){setError(result.error.message);return}
        setDriver({name:"",phone:"",cnic:"",address:"",licenseNumber:""});setNotice(`${result.data.name} added to drivers.`);return;
      }
      const result=await saveGuarantorAction({...guarantor,id:"",carAmount:Number(guarantor.carAmount||0)});
      if(!result.ok){setError(result.error.message);return}
      setGuarantor({name:"",parentage:"",cnic:"",phone:"",address:"",carAmount:""});setNotice(`${result.data.name} added to guarantors.`);
    } finally {setPending(false)}
  }
  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475467] hover:text-[#006FE6]"><ArrowLeft size={16}/>Dashboard</Link>
    <div><p className="text-xs font-bold uppercase tracking-wide text-[#006FE6]">Historical records</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Legacy data entry</h1><p className="mt-2 text-sm text-[#667085]">Add past records quickly. Imported bookings do not send customer or owner messages.</p></div>
    <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1" aria-label="Legacy entry sections">{tabs.map(item=><button key={item.id} type="button" onClick={()=>switchTab(item.id)} aria-current={tab===item.id?"page":undefined} className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold ${tab===item.id?"bg-[#006FE6] text-white":"text-[#475467] hover:bg-[#F2F4F7]"}`}>{item.label}</button>)}</nav>
    <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5"><h2 className="text-lg font-bold">{tabs.find(item=>item.id===tab)?.label}</h2><p className="mt-1 text-sm text-[#667085]">{tab==="booking"?"Select saved records, enter the historical amounts, and post in one step.":"Save this record inline, then continue with another section."}</p></div>
      {tab==="booking"&&<div className="space-y-5">
        <div className="grid grid-cols-4 gap-1" aria-label="Booking entry steps">{["Vehicle","Customer","Dates","Amounts"].map((label,index)=><button key={label} type="button" onClick={()=>setBookingStage(index)} aria-current={bookingStage===index?"step":undefined} className={`min-h-11 rounded-lg px-2 text-xs font-semibold sm:text-sm ${bookingStage===index?"bg-[#006FE6] text-white":"bg-[#F2F4F7] text-[#475467] hover:bg-[#E8F2FF]"}`}>{index+1}. {label}</button>)}</div>
        {bookingStage===0&&<div className="space-y-3"><FormSelect label="Vehicle" required value={booking.vehicleId} onChange={e=>setBooking({...booking,vehicleId:e.target.value})} options={[{label:"Select vehicle",value:""},...vehicles.map(item=>({label:`${item.make} ${item.model} · ${item.plate}`,value:item.id}))]}/><button type="button" onClick={()=>switchTab("vehicle")} className="text-sm font-semibold text-[#006FE6]">+ Add a vehicle inline</button></div>}
        {bookingStage===1&&<div className="space-y-3"><FormSelect label="Customer" required value={booking.customerId} onChange={e=>setBooking({...booking,customerId:e.target.value})} options={[{label:"Select customer",value:""},...customers.map(item=>({label:`${item.name} · ${item.phone}`,value:item.id}))]}/><button type="button" onClick={()=>switchTab("customer")} className="text-sm font-semibold text-[#006FE6]">+ Add a customer inline</button></div>}
        {bookingStage===2&&<div className="grid gap-4 sm:grid-cols-2"><FormInput label="Check-out date and time" required type="datetime-local" value={booking.pickupAt} onChange={e=>setBooking({...booking,pickupAt:e.target.value})}/><FormInput label="Check-in date and time" required type="datetime-local" value={booking.returnAt} onChange={e=>setBooking({...booking,returnAt:e.target.value})}/></div>}
        {bookingStage===3&&<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><FormInput label="Total amount (PKR)" required type="number" min={0} value={booking.totalAmount} onChange={e=>setBooking({...booking,totalAmount:e.target.value})}/><FormInput label="Amount received (PKR)" required type="number" min={0} value={booking.receivedAmount} onChange={e=>setBooking({...booking,receivedAmount:e.target.value})}/><div className="rounded-lg border bg-[#F8FAFC] p-3"><p className="text-xs font-semibold text-[#667085]">Outstanding</p><p className="mt-1 text-lg font-bold">{formatPkr(outstanding)}</p></div></div>{Number(booking.receivedAmount)>0&&<FormSelect label="Payment method" value={booking.paymentMethod} onChange={e=>setBooking({...booking,paymentMethod:e.target.value})} options={["Cash","Bank transfer","Card terminal","JazzCash","Easypaisa","Other wallet"]}/>}<button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-[#006FE6] hover:bg-[#F5FAFF]" onClick={()=>setShowExpense(true)}><Plus size={16}/>{booking.expenseAmount?"Edit booking expense":"Add expense to booking"}</button><Dialog.Root open={showExpense} onOpenChange={setShowExpense}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/><Dialog.Content className="fixed inset-x-3 top-1/2 z-50 max-h-[90vh] -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2"><Dialog.Title className="text-lg font-bold">Booking expense</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[#667085]">This expense will post to the ledger with the imported booking.</Dialog.Description><div className="mt-4 grid gap-4"><FormInput label="Expense amount (PKR)" required type="number" min={1} value={booking.expenseAmount} onChange={e=>setBooking({...booking,expenseAmount:e.target.value})}/><FormSelect label="Category" required value={booking.expenseCategory} onChange={e=>setBooking({...booking,expenseCategory:e.target.value})} options={[{label:"Select category",value:""},...categories.map(item=>({label:item,value:item}))]}/><FormInput label="Description" required value={booking.expenseDescription} onChange={e=>setBooking({...booking,expenseDescription:e.target.value})}/></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={()=>{setShowExpense(false);setBooking(current=>({...current,expenseAmount:"",expenseCategory:"",expenseDescription:""}))}}>Remove expense</Button><Button type="button" onClick={()=>setShowExpense(false)}>Done</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root><p className="text-xs text-[#667085]">This creates a completed historical booking. The received amount posts as income; an expense posts directly to the ledger.</p></div>}
      </div>}
      {tab==="vehicle"&&<div className="grid gap-4 sm:grid-cols-2"><FormInput label="Registration plate" required value={vehicle.plate} onChange={e=>setVehicle({...vehicle,plate:e.target.value})}/><FormInput label="Make" required value={vehicle.make} onChange={e=>setVehicle({...vehicle,make:e.target.value})}/><FormInput label="Model" required value={vehicle.model} onChange={e=>setVehicle({...vehicle,model:e.target.value})}/><FormInput label="Model year" required type="number" value={vehicle.year} onChange={e=>setVehicle({...vehicle,year:e.target.value})}/><FormInput label="Chassis number" required value={vehicle.chassisNumber} onChange={e=>setVehicle({...vehicle,chassisNumber:e.target.value})}/><FormInput label="Engine number" required value={vehicle.engineNumber} onChange={e=>setVehicle({...vehicle,engineNumber:e.target.value})}/><FormSelect label="City / branch" required value={vehicle.city} onChange={e=>setVehicle({...vehicle,city:e.target.value})} options={[{label:"Select city",value:""},...cities.map(city=>({label:city,value:city}))]}/><FormInput label="Daily rate (PKR)" required type="number" min={1000} value={vehicle.dailyRate} onChange={e=>setVehicle({...vehicle,dailyRate:e.target.value})}/><FormInput label="With-driver rate (PKR)" type="number" min={1000} value={vehicle.withDriverRate} onChange={e=>setVehicle({...vehicle,withDriverRate:e.target.value})}/><FormInput label="Colour" value={vehicle.color} onChange={e=>setVehicle({...vehicle,color:e.target.value})}/><FormSelect label="Category" value={vehicle.category} onChange={e=>setVehicle({...vehicle,category:e.target.value as Vehicle["category"]})} options={["Economy","Sedan","SUV"]}/><FormSelect label="Ownership" value={vehicle.ownership} onChange={e=>setVehicle({...vehicle,ownership:e.target.value as Vehicle["ownership"]})} options={["Own","Managed"]}/>{vehicle.ownership==="Managed"&&<FormSelect label="Owner" required value={vehicle.ownerId} onChange={e=>setVehicle({...vehicle,ownerId:e.target.value})} options={[{label:"Select owner",value:""},...owners.map(item=>({label:item.name,value:item.id}))]}/>}<FormSelect label="Transmission" value={vehicle.transmission} onChange={e=>setVehicle({...vehicle,transmission:e.target.value as Vehicle["transmission"]})} options={["Automatic","Manual"]}/><FormSelect label="Fuel" value={vehicle.fuel} onChange={e=>setVehicle({...vehicle,fuel:e.target.value as Vehicle["fuel"]})} options={["Petrol","Hybrid","Diesel"]}/></div>}
      {tab==="customer"&&<div className="grid gap-4 sm:grid-cols-2"><FormInput label="Full name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/><FormInput label="Phone" required type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/><FormInput label="CNIC" required value={customer.cnic} onChange={e=>setCustomer({...customer,cnic:e.target.value})}/></div>}
      {tab==="owner"&&<div className="grid gap-4 sm:grid-cols-2"><FormInput label="Owner name" required value={owner.name} onChange={e=>setOwner({...owner,name:e.target.value})}/><FormInput label="Phone" required type="tel" value={owner.phone} onChange={e=>setOwner({...owner,phone:e.target.value})}/><FormInput label="Email" type="email" value={owner.email} onChange={e=>setOwner({...owner,email:e.target.value})}/></div>}
      {tab==="driver"&&<div className="grid gap-4 sm:grid-cols-2"><FormInput label="Driver name" required value={driver.name} onChange={e=>setDriver({...driver,name:e.target.value})}/><FormInput label="Phone" type="tel" value={driver.phone} onChange={e=>setDriver({...driver,phone:e.target.value})}/><FormInput label="CNIC" value={driver.cnic} onChange={e=>setDriver({...driver,cnic:e.target.value})}/><FormInput label="Address" value={driver.address} onChange={e=>setDriver({...driver,address:e.target.value})}/><FormInput label="Driving licence" value={driver.licenseNumber} onChange={e=>setDriver({...driver,licenseNumber:e.target.value})}/></div>}
      {tab==="guarantor"&&<div className="grid gap-4 sm:grid-cols-2"><FormInput label="Guarantor name" required value={guarantor.name} onChange={e=>setGuarantor({...guarantor,name:e.target.value})}/><FormInput label="Parentage" value={guarantor.parentage} onChange={e=>setGuarantor({...guarantor,parentage:e.target.value})}/><FormInput label="Phone" type="tel" value={guarantor.phone} onChange={e=>setGuarantor({...guarantor,phone:e.target.value})}/><FormInput label="CNIC" value={guarantor.cnic} onChange={e=>setGuarantor({...guarantor,cnic:e.target.value})}/><FormInput label="Address" value={guarantor.address} onChange={e=>setGuarantor({...guarantor,address:e.target.value})}/><FormInput label="Vehicle value (PKR)" type="number" min={0} value={guarantor.carAmount} onChange={e=>setGuarantor({...guarantor,carAmount:e.target.value})}/></div>}
      {error&&<p role="alert" className="mt-4 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}{notice&&<p role="status" className="mt-4 rounded-lg bg-[#ECFDF3] p-3 text-sm text-[#067647]">{notice}</p>}
      <div className="mt-6 flex justify-end gap-2">{tab==="booking"&&bookingStage>0&&<Button type="button" variant="secondary" onClick={()=>setBookingStage(bookingStage-1)}>Back</Button>}{tab==="booking"&&bookingStage<3?<Button type="button" onClick={()=>setBookingStage(bookingStage+1)}>Continue</Button>:<Button type="button" disabled={pending} onClick={()=>void submit()}>{pending?"Saving…":tab==="booking"?"Import booking":`Save ${tab}`}</Button>}</div>
    </section>
  </div>;
}
