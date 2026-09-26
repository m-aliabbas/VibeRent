"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarFront, CheckCircle2, CirclePlus, Plus, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";
import { Button } from "@/components/ui/button";
import { vehicleRepository } from "@/lib/repositories/vehicle-repository";
import type { RepositoryResult } from "@/lib/repositories/repository";
import { formatPkr } from "@/lib/utils";
import type { Vehicle } from "@/types/vehicle";

const pageSize = 5;
type SortState = { key: string; direction: "asc" | "desc" };

export default function VehiclesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [removingPending, setRemovingPending] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [city, setCity] = useState("All");
  const [ownership, setOwnership] = useState("All");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({
    key: "vehicle",
    direction: "asc",
  });
  const [editing, setEditing] = useState<Vehicle | undefined>();
  const [removing, setRemoving] = useState<Vehicle | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [urlReady, setUrlReady] = useState(false);
  const [demo, setDemo] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const result = await vehicleRepository.list();
    if (result.ok) setItems(result.data);
    else setLoadError(result.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    const initialCity = params.get("city");
    const initialOwnership = params.get("ownership");
    const initialSort = params.get("sort");
    const initialDirection = params.get("direction");
    const demoState = params.get("demo") ?? "";
    queueMicrotask(() => {
      if (!active) return;
      setSearch(params.get("q") ?? "");
      setStatus(
        ["Available", "Booked", "Maintenance", "Out of Service"].includes(
          initialStatus ?? "",
        )
          ? initialStatus!
          : "All",
      );
      setCity(
        ["Lahore", "Islamabad", "Rawalpindi", "Karachi"].includes(
          initialCity ?? "",
        )
          ? initialCity!
          : "All",
      );
      setOwnership(
        ["Own", "Managed"].includes(initialOwnership ?? "")
          ? initialOwnership!
          : "All",
      );
      setPage(Math.max(1, Number(params.get("page")) || 1));
      if (initialSort)
        setSort({
          key: initialSort,
          direction: initialDirection === "desc" ? "desc" : "asc",
        });
      setDemo(demoState);
      setUrlReady(true);
    });
    if (demoState === "loading")
      return () => {
        active = false;
      };
    if (demoState === "error") {
      queueMicrotask(() => {
        if (!active) return;
        setLoadError("Simulated connection failure for recovery testing.");
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }
    if (demoState === "empty") {
      queueMicrotask(() => {
        if (!active) return;
        setItems([]);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }
    void vehicleRepository.list().then((result) => {
      if (!active) return;
      if (result.ok) setItems(result.data);
      else setLoadError(result.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status !== "All") params.set("status", status);
    if (city !== "All") params.set("city", city);
    if (ownership !== "All") params.set("ownership", ownership);
    if (page > 1) params.set("page", String(page));
    if (sort.key !== "vehicle" || sort.direction !== "asc") {
      params.set("sort", sort.key);
      params.set("direction", sort.direction);
    }
    if (demo) params.set("demo", demo);
    window.history.replaceState(
      null,
      "",
      `/vehicles${params.size ? `?${params}` : ""}`,
    );
  }, [search, status, city, ownership, page, sort, demo, urlReady]);

  const filtered = useMemo(
    () =>
      items
        .filter((vehicle) => {
          const term = search.trim().toLowerCase();
          const matchesTerm =
            !term ||
            `${vehicle.plate} ${vehicle.make} ${vehicle.model}`
              .toLowerCase()
              .includes(term);
          return (
            matchesTerm &&
            (status === "All" || vehicle.status === status) &&
            (city === "All" || vehicle.city === city) &&
            (ownership === "All" || vehicle.ownership === ownership)
          );
        })
        .sort((a, b) => {
          const get = (v: Vehicle) =>
            sort.key === "vehicle"
              ? `${v.make} ${v.model}`
              : sort.key === "rate"
                ? v.dailyRate
                : String(v[sort.key as keyof Vehicle] ?? "");
          return (
            String(get(a)).localeCompare(String(get(b)), undefined, {
              numeric: true,
            }) * (sort.direction === "asc" ? 1 : -1)
          );
        }),
    [items, search, status, city, ownership, sort],
  );
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = Boolean(
    search || status !== "All" || city !== "All" || ownership !== "All",
  );
  const changeSort = (key: string) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  const save = async (vehicle: Vehicle): Promise<RepositoryResult<Vehicle>> => {
    const exists = items.some((item) => item.id === vehicle.id);
    const result = await vehicleRepository.save(vehicle);
    if (!result.ok) return result;
    setItems((current) =>
      exists
        ? current.map((item) => (item.id === vehicle.id ? result.data : item))
        : [result.data, ...current],
    );
    setNotice(
      exists
        ? "Vehicle details updated."
        : `${result.data.make} ${result.data.model} added to the fleet.`,
    );
    setEditing(undefined);
    return result;
  };
  const remove = async () => {
    if (!removing) return;
    setRemovingPending(true);
    const result = await vehicleRepository.remove(removing.id);
    setRemovingPending(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== result.data.id));
    setNotice(`${removing.make} ${removing.model} removed from the fleet.`);
    setRemoving(undefined);
  };
  const columns: DataColumn<Vehicle>[] = [
    {
      key: "plate",
      header: "Plate",
      sortable: true,
      cell: (v) => <span className="font-bold text-[#344054]">{v.plate}</span>,
    },
    {
      key: "vehicle",
      header: "Vehicle",
      sortable: true,
      cell: (v) => (
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]">
            <CarFront size={19} />
          </span>
          <div>
            <p className="font-semibold">
              {v.make} {v.model}
            </p>
            <p className="mt-0.5 text-xs text-[#667085]">
              {v.year} · {v.category}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "city",
      header: "City",
      sortable: true,
      cell: (v) => <span className="text-[#475467]">{v.city}</span>,
    },
    {
      key: "ownership",
      header: "Ownership",
      cell: (v) => <StatusBadge status={v.ownership} />,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (v) => <StatusBadge status={v.status} />,
    },
    {
      key: "rate",
      header: "Daily rate",
      sortable: true,
      cell: (v) => (
        <span className="font-semibold tabular-nums">
          {formatPkr(v.dailyRate)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (v) => (
        <ActionMenu
          onView={() => router.push(`/vehicles/${v.id}`)}
          onEdit={() => {
            setEditing(v);
            setFormOpen(true);
          }}
          onDelete={() => setRemoving(v)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role="status"
          className="fixed right-4 top-20 z-40 flex max-w-[calc(100%-32px)] items-center gap-2 rounded-[10px] border border-[#ABEFC6] bg-white px-4 py-3 text-sm font-semibold text-[#067647] shadow-lg"
        >
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      <PageHeader
        eyebrow="Fleet management"
        title="Vehicles"
        description="Track availability, rates, ownership, and the current location of every vehicle."
        actions={
          <Button
            disabled={loading || Boolean(loadError)}
            title={
              loading || loadError ? "Wait for fleet data to load" : undefined
            }
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus size={18} />
            Add vehicle
          </Button>
        }
      />
      <details className="rounded-xl border border-dashed border-[#B2DDFF] bg-[#F5FAFF] px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-[#175CD3]">
          Prototype state previews
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["Default", ""],
            ["Loading", "loading"],
            ["Error", "error"],
            ["Empty", "empty"],
            ["Filtered empty", "filtered"],
          ].map(([label, value]) => (
            <Button key={label} asChild size="sm" variant="secondary">
              <Link
                href={
                  value === "filtered"
                    ? "/vehicles?q=no-matching-fleet-record"
                    : value
                      ? `/vehicles?demo=${value}`
                      : "/vehicles"
                }
              >
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </details>
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Fleet summary"
        aria-busy={loading}
      >
        {[
          {
            label: "Total fleet",
            value: items.length,
            icon: CarFront,
            tone: "text-[#006FE6] bg-[#EFF8FF]",
          },
          {
            label: "Available",
            value: items.filter((v) => v.status === "Available").length,
            icon: CirclePlus,
            tone: "text-[#067647] bg-[#ECFDF3]",
          },
          {
            label: "On booking",
            value: items.filter((v) => v.status === "Booked").length,
            icon: CarFront,
            tone: "text-[#5925DC] bg-[#F4F3FF]",
          },
          {
            label: "Needs attention",
            value: items.filter((v) =>
              ["Maintenance", "Out of Service"].includes(v.status),
            ).length,
            icon: Wrench,
            tone: "text-[#B54708] bg-[#FFFAEB]",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-[#E8ECF2] bg-white p-4"
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-[9px] ${tone}`}
            >
              <Icon size={18} />
            </span>
            <div>
              <p className="text-xl font-bold">{loading ? "—" : value}</p>
              <p className="text-xs text-[#667085]">{label}</p>
            </div>
          </div>
        ))}
      </section>
      <FilterBar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        hasFilters={hasFilters}
        onClear={() => {
          setSearch("");
          setStatus("All");
          setCity("All");
          setOwnership("All");
          setPage(1);
        }}
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={["Available", "Booked", "Maintenance", "Out of Service"]}
        />
        <FilterSelect
          label="City"
          value={city}
          onChange={(value) => {
            setCity(value);
            setPage(1);
          }}
          options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]}
        />
        <FilterSelect
          label="Ownership"
          value={ownership}
          onChange={(value) => {
            setOwnership(value);
            setPage(1);
          }}
          options={["Own", "Managed"]}
        />
      </FilterBar>
      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <InlineError message={loadError} onRetry={() => void loadVehicles()} />
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(v) => v.id}
          sort={sort}
          onSort={changeSort}
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          empty={<EmptyState filtered={hasFilters} />}
          mobileCard={(v) => (
            <div>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]">
                  <CarFront size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {v.make} {v.model}
                  </p>
                  <p className="mt-0.5 text-xs text-[#667085]">
                    {v.plate} · {v.year} · {v.city}
                  </p>
                </div>
                <ActionMenu
                  onView={() => router.push(`/vehicles/${v.id}`)}
                  onEdit={() => {
                    setEditing(v);
                    setFormOpen(true);
                  }}
                  onDelete={() => setRemoving(v)}
                />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#EAECF0] pt-3">
                <div className="flex gap-2">
                  <StatusBadge status={v.status} />
                  <StatusBadge status={v.ownership} />
                </div>
                <span className="text-sm font-bold">
                  {formatPkr(v.dailyRate)}
                  <span className="font-normal text-[#667085]">/day</span>
                </span>
              </div>
            </div>
          )}
        />
      )}
      {formOpen && (
        <VehicleDialog
          open
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(undefined);
          }}
          vehicle={editing}
          onSave={save}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove ${removing?.plate ?? "vehicle"}?`}
        description="This removes the vehicle from this prototype fleet. Existing booking history would be preserved in a production system."
        onConfirm={() => void remove()}
        pending={removingPending}
      />
    </div>
  );
}
