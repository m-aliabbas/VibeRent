"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, UserRound, X } from "lucide-react";
import { customers as seed } from "@/lib/operations-data";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";

type CustomerRecord = (typeof seed)[number] & { city: string; email: string };
const initial: CustomerRecord[] = seed.map((item, index) => ({
  ...item,
  city: ["Lahore", "Islamabad", "Rawalpindi", "Karachi"][index],
  email: `${item.name.toLowerCase().replace(" ", ".")}@example.pk`,
}));
const normalize = (value: string) => value.replace(/\D/g, "");
export function CustomersModule() {
  const [items, setItems] = useState(initial);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [editing, setEditing] = useState<CustomerRecord>();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const rows = useMemo(
    () =>
      items.filter(
        (item) =>
          (status === "All" || item.status === status) &&
          JSON.stringify(item).toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search, status],
  );
  const save = (item: CustomerRecord) => {
    setItems((current) =>
      current.some((row) => row.id === item.id)
        ? current.map((row) => (row.id === item.id ? item : row))
        : [item, ...current],
    );
    setNotice(`${item.name} ${editing ? "updated" : "added"}.`);
    setOpen(false);
    setEditing(undefined);
  };
  return (
    <div className="space-y-6">
      <Toast message={notice} onDismiss={() => setNotice("")} />
      <PageHeader
        eyebrow="Customer records"
        title="Customers"
        description="Manage renter identity, contact details, rental history, and operational warnings."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Plus size={17} />
            Add customer
          </Button>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Customers", "218"],
          ["Repeat renters", "42%"],
          ["Preferred", "31"],
          ["Needs review", "3"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[#E8ECF2] bg-white p-4"
          >
            <p className="text-xs text-[#667085]">{label}</p>
            <p className="mt-2 text-xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search name, phone or CNIC…"
        hasFilters={Boolean(search || status !== "All")}
        onClear={() => {
          setSearch("");
          setStatus("All");
        }}
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={["Active", "Preferred", "Review"]}
        />
      </FilterBar>
      <div className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white">
        <div className="divide-y divide-[#EAECF0]">
          {rows.map((item) => (
            <article
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]">
                <UserRound size={18} />
              </span>
              <div className="flex-1">
                <Link
                  href={`/customers/${item.id}`}
                  className="text-sm font-bold hover:text-[#006FE6]"
                >
                  {item.name}
                </Link>
                <p className="mt-1 text-xs text-[#667085]">
                  {item.phone} · {item.cnic} · {item.city}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(item);
                    setOpen(true);
                  }}
                >
                  <Pencil size={15} />
                  Edit
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/customers/${item.id}`}>View</Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {open && (
        <CustomerDialog
          open
          record={editing}
          all={items}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEditing(undefined);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

function CustomerDialog({
  open,
  record,
  all,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  record?: CustomerRecord;
  all: CustomerRecord[];
  onOpenChange: (open: boolean) => void;
  onSave: (item: CustomerRecord) => void;
}) {
  const [form, setForm] = useState<CustomerRecord>(
    () =>
      record ?? {
        id: `CUS-${Date.now()}`,
        name: "",
        phone: "",
        cnic: "",
        bookings: 0,
        lastRental: "No rentals",
        status: "Active",
        city: "Lahore",
        email: "",
      },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<CustomerRecord>();
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Customer name is required.";
    if (normalize(form.phone).length < 11)
      next.phone = "Enter a valid Pakistani phone number.";
    if (normalize(form.cnic).length !== 13)
      next.cnic = "CNIC must contain 13 digits.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const match = all.find(
      (item) =>
        item.id !== form.id &&
        (normalize(item.phone) === normalize(form.phone) ||
          normalize(item.cnic) === normalize(form.cnic)),
    );
    if (match) {
      setDuplicate(match);
      return;
    }
    onSave(form);
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex justify-between border-b border-[#EAECF0] p-5">
            <div>
              <Dialog.Title className="font-bold">
                {record ? "Edit customer" : "Add customer"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#667085]">
                Identity details use fictional prototype data.
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F2F4F7]">
              <X size={18} />
              <span className="sr-only">Close customer form</span>
            </Dialog.Close>
          </div>
          <form onSubmit={submit}>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <FormInput
                label="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={errors.name}
              />
              <FormInput
                label="Phone"
                placeholder="+92 300 123 4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                error={errors.phone}
              />
              <FormInput
                label="CNIC"
                placeholder="35202-1234567-1"
                value={form.cnic}
                onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                error={errors.cnic}
              />
              <FormInput
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <FormSelect
                label="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]}
              />
              <FormSelect
                label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={["Active", "Preferred", "Review"]}
              />
              {duplicate && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D] sm:col-span-2"
                >
                  <strong>Possible duplicate: {duplicate.name}</strong>
                  <p className="mt-1 text-xs">
                    {duplicate.phone} · {duplicate.cnic}
                  </p>
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                  >
                    <Link href={`/customers/${duplicate.id}`}>
                      Open matching customer
                    </Link>
                  </Button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#EAECF0] p-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save customer</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
