"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  CircleHelp,
  Gauge,
  Menu,
  Search,
  Settings,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/layout/command-palette";

const nav = [
  { label: "Dashboard", href: "/", icon: Gauge },
  { label: "Vehicles", href: "/vehicles", icon: CarFront },
  { label: "Bookings", href: "/bookings", icon: CalendarDays },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Expenses", href: "/expenses", icon: CircleDollarSign },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Owners", href: "/owners", icon: UserSquare2 },
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-[#E6EAF0] bg-white px-3 py-5 lg:flex">
        <div className="px-2.5">
          <Brand />
        </div>
        <div className="mt-7 flex-1">
          <NavLinks />
        </div>
        <button
          className="flex w-full items-center gap-3 rounded-xl border border-[#E4E7EC] bg-white p-3 text-left shadow-[0_2px_6px_rgba(16,24,40,.04)] hover:border-[#B9D9FF]"
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

      <div className="lg:pl-[224px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center border-b border-[#E6EAF0] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-7">
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
              Search vehicles, bookings, customers...
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
            <button
              className="ml-1 hidden items-center gap-2.5 sm:flex"
              aria-label="Open user menu"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#CFD7E5] to-[#7A879B] text-xs font-bold text-white ring-2 ring-white">
                MA
              </span>
              <span className="text-left">
                <span className="block text-sm font-semibold text-[#101828]">
                  Ali
                </span>
                <span className="block text-xs text-[#667085]">
                  Fleet Manager
                </span>
              </span>
              <ChevronDown size={16} className="text-[#344054]" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-7 lg:py-6">
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
            <div className="mt-8 flex-1">
              <NavLinks close={() => setOpen(false)} />
            </div>
            <div className="border-t border-[#EAECF0] px-2 pt-4 text-sm font-semibold">
              Muhammad Ali
              <div className="text-xs font-normal text-[#667085]">
                Agency owner
              </div>
            </div>
          </aside>
        </div>
      )}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
