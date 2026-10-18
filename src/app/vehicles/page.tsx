"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CarFront, CirclePlus, Plus, Trash2, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { Toast } from "@/components/shared/toast";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";
import { Button } from "@/components/ui/button";
import { vehicleRepository } from "@/lib/repositories/vehicle-repository";
import type { RepositoryResult } from "@/lib/repositories/repository";
import { formatPkr } from "@/lib/utils";
import type { Vehicle } from "@/types/vehicle";
import { setVehicleArchivedAction } from "@/app/actions/vehicles";

const pageSize = 20;
type SortState = { key: string; direction: "asc" | "desc" };
type FleetView = "active" | "archived";

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
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
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
  const [fleetView, setFleetView] = useState<FleetView>("active");

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
    const initialFleetView = params.get("view") === "archived" ? "archived" : "active";
    queueMicrotask(() => {
      if (!active) return;
      setSearch(params.get("q") ?? "");
      setStatus(
        initialFleetView === "active" &&
          [
            "Available",
            "Booked",
            "Maintenance",
            "Out of Service",
            "Needs attention",
          ].includes(initialStatus ?? "")
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
      setMinRate(params.get("minRate") ?? "");
      setMaxRate(params.get("maxRate") ?? "");
      setPage(Math.max(1, Number(params.get("page")) || 1));
      if (initialSort)
        setSort({
          key: initialSort,
          direction: initialDirection === "desc" ? "desc" : "asc",
        });
      setDemo(demoState);
      setFleetView(initialFleetView);
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
    if (minRate) params.set("minRate", minRate);
    if (maxRate) params.set("maxRate", maxRate);
    if (page > 1) params.set("page", String(page));
    if (sort.key !== "vehicle" || sort.direction !== "asc") {
      params.set("sort", sort.key);
      params.set("direction", sort.direction);
    }
    if (demo) params.set("demo", demo);
    if (fleetView === "archived") params.set("view", "archived");
    window.history.replaceState(
      null,
      "",
      `/vehicles${params.size ? `?${params}` : ""}`,
    );
  }, [search, status, city, ownership, minRate, maxRate, page, sort, demo, fleetView, urlReady]);

  const activeItems = useMemo(
    () => items.filter((vehicle) => vehicle.status !== "Archived"),
    [items],
  );
  const archivedItems = useMemo(
    () => items.filter((vehicle) => vehicle.status === "Archived"),
    [items],
  );

  const filtered = useMemo(
    () =>
      (fleetView === "archived" ? archivedItems : activeItems)
        .filter((vehicle) => {
          const term = search.trim().toLowerCase();
          const matchesTerm =
            !term ||
            `${vehicle.plate} ${vehicle.make} ${vehicle.model}`
              .toLowerCase()
              .includes(term);
          return (
            matchesTerm &&
            (fleetView === "archived" || status === "All" || (status === "Needs attention" ? ["Maintenance","Out of Service"].includes(vehicle.status) : vehicle.status === status)) &&
            (city === "All" || vehicle.city === city) &&
            (ownership === "All" || vehicle.ownership === ownership) &&
            (!minRate || vehicle.dailyRate >= Number(minRate)) &&
            (!maxRate || vehicle.dailyRate <= Number(maxRate))
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
    [activeItems, archivedItems, fleetView, search, status, city, ownership, minRate, maxRate, sort],
  );
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = Boolean(
    search || status !== "All" || city !== "All" || ownership !== "All" || minRate || maxRate,
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
    const restoring = removing.status === "Archived";
    const result = await setVehicleArchivedAction(removing.id,!restoring);
    setRemovingPending(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setItems((current) =>
      current.map((item) => (item.id === removing.id ? result.data : item)),
    );
    setNotice(
      `${removing.make} ${removing.model} ${restoring ? "restored to" : "archived from"} the fleet.`,
    );
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
            <Link href={`/vehicles/${v.id}`} className="font-semibold hover:text-[#006FE6] hover:underline">
              {v.make} {v.model}
            </Link>
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
        <div className="flex items-center justify-end gap-1">
          {v.status!=="Archived"?<Button size="sm" variant="danger" onClick={event=>{event.stopPropagation();setRemoving(v)}}><Trash2 size={15}/>Delete</Button>:<Button asChild size="sm" variant="danger"><Link href={`/archive?q=${encodeURIComponent(v.plate)}`} onClick={event=>event.stopPropagation()}><Trash2 size={15}/>Delete permanently</Link></Button>}
          <ActionMenu
            onView={() => router.push(`/vehicles/${v.id}`)}
            onEdit={() => {
              setEditing(v);
              setFormOpen(true);
            }}
            onDelete={() => setRemoving(v)}
            archived={v.status === "Archived"}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Toast message={notice} onDismiss={() => setNotice("")} />
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
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#E4E7EC] bg-white p-1.5" aria-label="Fleet views">
        {([
          ["active", "Active fleet", activeItems.length, CarFront],
          ["archived", "Deleted / archived", archivedItems.length, Archive],
        ] as const).map(([value, label, count, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={fleetView === value}
            onClick={() => {
              setFleetView(value);
              setStatus("All");
              setPage(1);
            }}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${fleetView === value ? "bg-[#EAF4FF] text-[#005BBE]" : "text-[#667085] hover:bg-[#F8FAFC] hover:text-[#344054]"}`}
          >
            <Icon size={16} />
            {label}
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${fleetView === value ? "bg-white text-[#005BBE]" : "bg-[#F2F4F7] text-[#667085]"}`}>{loading ? "—" : count}</span>
          </button>
        ))}
      </div>
      {fleetView === "active" && <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Fleet summary"
        aria-busy={loading}
      >
        {[
          {
            label: "Total fleet",
            value: activeItems.length,
            icon: CarFront,
            tone: "text-[#006FE6] bg-[#EFF8FF]",
          },
          {
            label: "Available",
            value: activeItems.filter((v) => v.status === "Available").length,
            icon: CirclePlus,
            tone: "text-[#067647] bg-[#ECFDF3]",
          },
          {
            label: "On booking",
            value: activeItems.filter((v) => v.status === "Booked").length,
            icon: CarFront,
            tone: "text-[#5925DC] bg-[#F4F3FF]",
          },
          {
            label: "Needs attention",
            value: activeItems.filter((v) =>
              ["Maintenance", "Out of Service"].includes(v.status),
            ).length,
            icon: Wrench,
            tone: "text-[#B54708] bg-[#FFFAEB]",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <button
            type="button"
            key={label}
            aria-pressed={label === "Total fleet" ? status === "All" : label === "On booking" ? status === "Booked" : label === "Needs attention" ? status === "Needs attention" : status === label}
            onClick={() => { setStatus(label === "Total fleet" ? "All" : label === "On booking" ? "Booked" : label); setPage(1); }}
            className={`flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition hover:border-[#84CAFF] ${(label === "Total fleet" ? status === "All" : label === "On booking" ? status === "Booked" : label === "Needs attention" ? status === "Needs attention" : status === label) ? "border-[#006FE6] ring-2 ring-[#006FE6]/10" : "border-[#E8ECF2]"}`}
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
          </button>
        ))}
      </section>}
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
          setMinRate("");
          setMaxRate("");
          setPage(1);
        }}
      >
        {fleetView === "active" && <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            "Available",
            "Booked",
            "Maintenance",
            "Out of Service",
            "Needs attention",
          ]}
        />}
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
      <div className="grid gap-3 rounded-xl border border-[#E4E7EC] bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-semibold text-[#475467]">Minimum daily price<input aria-label="Minimum daily price" type="number" min={0} value={minRate} onChange={event=>{setMinRate(event.target.value);setPage(1)}} placeholder="No minimum" className="field mt-1.5"/></label>
        <label className="text-xs font-semibold text-[#475467]">Maximum daily price<input aria-label="Maximum daily price" type="number" min={0} value={maxRate} onChange={event=>{setMaxRate(event.target.value);setPage(1)}} placeholder="No maximum" className="field mt-1.5"/></label>
        <p className="pb-2 text-xs text-[#667085]">{filtered.length} vehicle{filtered.length===1?"":"s"} match</p>
      </div>
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
          onRowClick={(vehicle)=>router.push(`/vehicles/${vehicle.id}`)}
          onPageChange={setPage}
          empty={<EmptyState filtered={hasFilters} />}
          mobileCard={(v) => (
            <div>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-[#EFF8FF] text-[#006FE6]">
                  <CarFront size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/vehicles/${v.id}`} className="block truncate font-semibold hover:text-[#006FE6]">
                    {v.make} {v.model}
                  </Link>
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
                  archived={v.status === "Archived"}
                />
                {v.status!=="Archived"?<Button size="sm" variant="danger" onClick={()=>setRemoving(v)}><Trash2 size={15}/>Delete</Button>:<Button asChild size="sm" variant="danger"><Link href={`/archive?q=${encodeURIComponent(v.plate)}`}><Trash2 size={15}/>Delete permanently</Link></Button>}
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
        title={`${removing?.status === "Archived" ? "Restore" : "Delete"} ${removing?.plate ?? "vehicle"}?`}
        description={
          removing?.status === "Archived"
            ? "The vehicle will return to the active fleet. It will be marked Booked if it still has an active booking; otherwise it will be Available."
            : "The vehicle will move to Deleted / archived and leave the active fleet. Its bookings, expenses, and audit history will remain available."
        }
        onConfirm={() => void remove()}
        pending={removingPending}
        confirmLabel={
          removing?.status === "Archived"
            ? "Restore vehicle"
            : "Delete vehicle"
        }
        pendingLabel={
          removing?.status === "Archived" ? "Restoring…" : "Deleting…"
        }
      />
    </div>
  );
}
