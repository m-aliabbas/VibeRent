"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CarFront, Droplets, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSelect, useFilterFacet } from "@/components/shared/filter-bar";
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
import { deleteVehicleAction, setVehicleArchivedAction } from "@/app/actions/vehicles";
import { VehicleDeleteDialog } from "@/components/vehicles/vehicle-delete-dialog";
import { OilChangeBadge } from "@/components/vehicles/oil-change-panel";
import { needsOilChange } from "@/lib/oil-change";

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
      if (params.get("new") === "1") { setEditing(undefined); setFormOpen(true); }
      setStatus(
        initialFleetView === "active" &&
          [
            "Available",
            "Booked",
            "Maintenance",
            "Out of Service",
            "Needs attention",
            "Oil change due",
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

  const oilChangeDue = useMemo(() => activeItems.filter((vehicle) => needsOilChange(vehicle.oilChange)), [activeItems]);
  const overdueCount = oilChangeDue.filter((vehicle) => vehicle.oilChange?.state === "overdue").length;

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
            (fleetView === "archived" || status === "All" || (status === "Needs attention" ? ["Maintenance","Out of Service"].includes(vehicle.status) : status === "Oil change due" ? needsOilChange(vehicle.oilChange) : vehicle.status === status)) &&
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
  const deleteRemoving = async (deleteHistory: boolean) => {
    if (!removing) return;
    setRemovingPending(true);
    const result = await deleteVehicleAction(removing.id, deleteHistory);
    setRemovingPending(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== removing.id));
    setNotice(
      `${removing.make} ${removing.model} deleted${deleteHistory ? " with its bookings, payments, and expenses" : ". Its history stays in ledgers"}.`,
    );
    setRemoving(undefined);
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
      cell: (v) => <span className="font-mono text-[13px] font-semibold text-[#344054]">{v.plate}</span>,
    },
    {
      key: "vehicle",
      header: "Vehicle",
      sortable: true,
      cell: (v) => (
        <div>
          <Link href={`/vehicles/${v.id}`} className="font-semibold hover:text-[#006FE6] hover:underline">
            {v.make} {v.model}
          </Link>
          <span className="ml-2 text-xs text-[#667085]">{v.year} · {v.category}</span>
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
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={v.status} />
          {v.status !== "Archived" && needsOilChange(v.oilChange) && <OilChangeBadge summary={v.oilChange} />}
        </div>
      ),
    },
    {
      key: "rate",
      header: "Daily rate",
      sortable: true,
      className: "text-right",
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
          {v.status==="Archived"&&<Button asChild size="sm" variant="dangerOutline"><Link href={`/archive?q=${encodeURIComponent(v.plate)}`} onClick={event=>event.stopPropagation()}><Trash2 size={15}/>Delete permanently</Link></Button>}
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
            shortcut="n"
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
      <div className="flex gap-1 border-b border-[#E4E7EC]" role="tablist" aria-label="Fleet views">
        {([
          ["active", "Active fleet", activeItems.length, CarFront],
          ["archived", "Deleted / archived", archivedItems.length, Archive],
        ] as const).map(([value, label, count, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={fleetView === value}
            onClick={() => {
              setFleetView(value);
              setStatus("All");
              setPage(1);
            }}
            className={`-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${fleetView === value ? "border-[#006FE6] text-[#0058B8]" : "border-transparent text-[#475467] hover:text-[#19191F]"}`}
          >
            <Icon size={16} />
            {label}
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${fleetView === value ? "bg-white text-[#005BBE]" : "bg-[#F2F4F7] text-[#667085]"}`}>{loading ? "—" : count}</span>
          </button>
        ))}
      </div>
      {fleetView === "active" && !loading && oilChangeDue.length > 0 && status !== "Oil change due" && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-4 sm:flex-row sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-white text-[#B54708]"><Droplets size={18} /></span>
          <p className="flex-1 text-sm text-[#93370D]">
            <strong>{oilChangeDue.length} vehicle{oilChangeDue.length === 1 ? " is" : "s are"} due for an oil change</strong>
            {overdueCount > 0 && <> · {overdueCount} overdue</>}
          </p>
          <Button size="sm" variant="secondary" onClick={() => { setStatus("Oil change due"); setPage(1); }}>Show vehicles</Button>
        </div>
      )}
      <FilterBar
        placeholder="Search plate, make or model…"
        summary={`${filtered.length} vehicle${filtered.length === 1 ? "" : "s"}`}
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
            "Oil change due",
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
        <RateRange min={minRate} max={maxRate} onChange={(nextMin, nextMax) => { setMinRate(nextMin); setMaxRate(nextMax); setPage(1); }} />
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
          onRowClick={(vehicle)=>router.push(`/vehicles/${vehicle.id}`)}
          onPageChange={setPage}
          empty={<EmptyState filtered={hasFilters} title={hasFilters ? "No vehicles match" : "No vehicles yet"} description={hasFilters ? "Clear a filter or change the search." : "Press N or use Add vehicle to add the first car."} />}
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
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#EAECF0] pt-3">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={v.status} />
                  <StatusBadge status={v.ownership} />
                  {v.status !== "Archived" && needsOilChange(v.oilChange) && <OilChangeBadge summary={v.oilChange} />}
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
      {removing && removing.status !== "Archived" ? (
        <VehicleDeleteDialog
          key={removing.id}
          open
          onOpenChange={(open) => !open && setRemoving(undefined)}
          label={`${removing.make} ${removing.model} · ${removing.plate}`}
          canDeleteHistory
          pending={removingPending}
          onConfirm={(deleteHistory) => void deleteRemoving(deleteHistory)}
        />
      ) : (
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
      )}
    </div>
  );
}

function RateRange({ min, max, onChange }: { min: string; max: string; onChange: (min: string, max: string) => void }) {
  useFilterFacet("rate", min || max ? `Rate: ${min || "0"} – ${max || "any"}` : null, () => onChange("", ""));
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-bold uppercase tracking-[.04em] text-[#475467]">Daily rate (PKR)</legend>
      <div className="flex items-center gap-1">
        <input aria-label="Minimum daily rate" type="number" inputMode="numeric" min={0} step={500} value={min} onChange={event => onChange(event.target.value, max)} placeholder="Min" className="h-8 min-w-0 flex-1 rounded-[6px] border border-[#D0D5DD] px-2 text-[13px] tabular-nums" />
        <span className="text-[#667085]">–</span>
        <input aria-label="Maximum daily rate" type="number" inputMode="numeric" min={0} step={500} value={max} onChange={event => onChange(min, event.target.value)} placeholder="Max" className="h-8 min-w-0 flex-1 rounded-[6px] border border-[#D0D5DD] px-2 text-[13px] tabular-nums" />
      </div>
    </fieldset>
  );
}
