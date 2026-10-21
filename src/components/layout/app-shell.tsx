"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Archive,
  Bell,
  Building2,
  CalendarDays,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  CircleHelp,
  Gauge,
  LogOut,
  Menu, MessageCircle,
  Search,
  ScanText,
  Settings,
  Users,
  UserSquare2,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/layout/command-palette";
import { authClient } from "@/lib/auth-client";
import type { SessionViewer } from "@/server/auth/session";
import { updateMyProfileAction } from "@/app/actions/organization";
import { FormInput } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";

const nav = [
  { label: "Dashboard", href: "/", icon: Gauge },
  { label: "Vehicles", href: "/vehicles", icon: CarFront },
  { label: "Bookings", href: "/bookings", icon: CalendarDays },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Expenses", href: "/expenses", icon: CircleDollarSign },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Owners", href: "/owners", icon: UserSquare2 },
  { label: "Drivers", href: "/drivers", icon: UserRound },
  { label: "Guarantors", href: "/guarantors", icon: UserRound },
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { label: "CNIC OCR", href: "/cnic-ocr", icon: ScanText },
  { label: "Settings", href: "/settings", icon: Settings },
];

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none"
      aria-label="VibeRent home"
    >
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 5.5h8.2l6.35 15.1L23.45 5.5h8.05L18.9 29h-4L2.5 5.5Z"
          fill="#0878F9"
        />
        <path
          d="M22 24.6c2.8-.15 5.1-1 7.2-2.55"
          stroke="#006FE6"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[21px] font-extrabold tracking-[-.055em] text-[#0B1633]">
        Vibe<span className="text-[#0878F9]">Rent</span>
      </span>
    </Link>
  );
}

function NavLinks({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {nav.map(({ label, href, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={cn(
              "flex h-12 items-center gap-3.5 rounded-[10px] px-3.5 text-[15px] font-medium transition-colors",
              active
                ? "bg-[#EAF3FF] font-semibold text-[#006FE6]"
                : "text-[#15213B] hover:bg-[#F5F8FC]",
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.35 : 1.85} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children, viewer }: { children: React.ReactNode; viewer: SessionViewer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside data-app-chrome className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-[#E6EAF0] bg-white px-3 py-5 lg:flex">
        <div className="px-2.5">
          <Brand />
        </div>
        <div className="-mx-1 mt-7 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3">
          <NavLinks />
        </div>
        <button
          className="flex w-full shrink-0 items-center gap-3 rounded-xl border border-[#E4E7EC] bg-white p-3 text-left shadow-[0_2px_6px_rgba(16,24,40,.04)] hover:border-[#B9D9FF]"
          aria-label="Open help center"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0878F9] text-white">
            <CircleHelp size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-[#15213B]">
              Need help?
            </span>
            <span className="mt-0.5 block text-[11px] text-[#667085]">
              Visit our Help Center
            </span>
          </span>
          <span className="text-lg text-[#344054]">›</span>
        </button>
      </aside>

      <div data-app-content-wrapper className="lg:pl-[224px]">
        <header data-app-chrome className="sticky top-0 z-20 flex h-[72px] items-center border-b border-[#E6EAF0] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-7">
          <button
            onClick={() => setOpen(true)}
            className="mr-3 grid h-10 w-10 place-items-center rounded-lg text-[#475467] hover:bg-[#F2F4F7] lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden h-11 max-w-[460px] flex-1 items-center gap-2.5 rounded-[10px] border border-[#DDE2EA] bg-white px-3 text-left shadow-[0_1px_2px_rgba(16,24,40,.03)] hover:border-[#B9D9FF] sm:flex"
            aria-label="Open global search"
          >
            <Search size={18} className="text-[#26334D]" />
            <span className="flex-1 text-sm text-[#667085]">
              Search vehicles, bookings, customers, owners...
            </span>
            <kbd className="text-xs font-medium text-[#667085]">⌘ K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-full text-[#475467] hover:bg-[#F2F4F7] sm:hidden"
              aria-label="Open global search"
            >
              <Search size={20} />
            </button>
            <button
              className="relative grid h-10 w-10 place-items-center rounded-full text-[#475467] hover:bg-[#F2F4F7]"
              aria-label="Notifications"
            >
              <Bell size={20} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#F04438]" />
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button className="ml-1 hidden items-center gap-2.5 rounded-lg p-1 text-left hover:bg-[#F8FAFC] sm:flex" aria-label="Open user menu"><span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#1488FF] to-[#0057B8] text-xs font-bold text-white ring-2 ring-white">{initials(viewer.name)}</span><span><span className="block max-w-36 truncate text-sm font-semibold text-[#101828]">{viewer.name}</span><span className="block max-w-36 truncate text-xs text-[#667085]">{roleLabel(viewer.role)}</span></span><ChevronDown size={16} className="text-[#344054]"/></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-64 rounded-xl border border-[#E4E7EC] bg-white p-1.5 shadow-xl"><div className="border-b px-3 py-2.5"><p className="truncate text-sm font-semibold">{viewer.name}</p><p className="truncate text-xs text-[#667085]">{viewer.email}</p></div><DropdownMenu.Item onSelect={()=>setProfileOpen(true)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[#F2F4F7]"><UserRound size={16}/>Edit my profile</DropdownMenu.Item><div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#98A2B3]">Agency</div>{viewer.organizations.map(org=><DropdownMenu.Item key={org.id} disabled={org.id===viewer.activeAgencyId} onSelect={async()=>{await authClient.organization.setActive({organizationId:org.id});router.push("/");router.refresh()}} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[#F2F4F7] disabled:cursor-default disabled:bg-[#EFF8FF] disabled:text-[#175CD3]"><Building2 size={16}/><span className="flex-1 truncate">{org.name}</span>{org.id===viewer.activeAgencyId&&<span className="text-xs">Active</span>}</DropdownMenu.Item>)}<DropdownMenu.Separator className="my-1 h-px bg-[#EAECF0]"/><DropdownMenu.Item onSelect={async()=>{await authClient.signOut();router.push("/sign-in");router.refresh()}} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#B42318] outline-none hover:bg-[#FEF3F2]"><LogOut size={16}/>Sign out</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <main data-app-content className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-7 lg:py-6">
          {children}
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-[#101828]/35"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="relative flex h-full w-[286px] flex-col bg-white px-4 py-5 shadow-2xl">
            <div className="flex items-center justify-between px-2">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#F2F4F7]"
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>
            <div className="-mx-1 mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3">
              <NavLinks close={() => setOpen(false)} />
            </div>
            <div className="shrink-0 border-t border-[#EAECF0] px-2 pt-4 text-sm font-semibold">
              {viewer.name}
              <div className="text-xs font-normal text-[#667085]">
                {roleLabel(viewer.role)} · {viewer.activeAgencyName}
              </div>
            </div>
            <button onClick={async()=>{await authClient.signOut();router.push("/sign-in");router.refresh()}} className="mt-3 flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border text-sm font-semibold text-[#B42318]"><LogOut size={17}/>Sign out</button>
          </aside>
        </div>
      )}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} viewer={viewer} onSaved={()=>router.refresh()}/>
    </div>
  );
}

function initials(name:string){return name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"VR";}
function roleLabel(role?:string){return role?.split("_").map(part=>part[0].toUpperCase()+part.slice(1)).join(" ")??"Staff member";}

function ProfileDialog({open,onOpenChange,viewer,onSaved}:{open:boolean;onOpenChange:(open:boolean)=>void;viewer:SessionViewer;onSaved:()=>void}){const [name,setName]=useState(viewer.name);const [phone,setPhone]=useState("");const [pending,setPending]=useState(false);const [error,setError]=useState("");async function save(){setPending(true);setError("");const result=await updateMyProfileAction({name,phone});setPending(false);if(!result.ok){setError(result.message);return}onOpenChange(false);onSaved()}return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><Dialog.Title className="font-bold">My profile</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">Update the name and phone shown to your agency team.</Dialog.Description></div><Dialog.Close className="grid h-10 w-10 place-items-center rounded-lg"><X size={18}/></Dialog.Close></div><div className="mt-5 space-y-4"><FormInput label="Full name" value={name} onChange={e=>setName(e.target.value)} required/><FormInput label="Email" value={viewer.email} disabled/><FormInput label="Phone" type="tel" placeholder="+92 300 123 4567" value={phone} onChange={e=>setPhone(e.target.value)}/>{error&&<p role="alert" className="text-sm text-[#B42318]">{error}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={pending||name.trim().length<2} onClick={()=>void save()}>{pending?"Saving…":"Save profile"}</Button></div></div></Dialog.Content></Dialog.Portal></Dialog.Root>}
