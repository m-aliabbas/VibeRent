import "server-only";

import type { RequestContext } from "@/server/context/request-context";
import { listBookings } from "@/server/services/booking-service";
import { listCustomers } from "@/server/services/customer-service";
import { listOwners } from "@/server/services/owner-service";
import { listVehicles } from "@/server/services/vehicle-service";

export type GlobalSearchResult = {
  id: string;
  kind: "vehicle" | "booking" | "customer" | "owner";
  label: string;
  detail: string;
  href: string;
};

export type GlobalSearchScope = "all" | "pages" | "vehicle" | "booking" | "customer" | "owner";

export function searchAgencyRecords(context: RequestContext, rawQuery: string, scope: GlobalSearchScope = "all"): GlobalSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase("en");
  if (query.length < 2) return [];
  const matches = (value: Array<string | number | null | undefined>) =>
    value.some((item) => String(item ?? "").toLocaleLowerCase("en").includes(query));
  const resultLimit = scope === "all" ? 3 : 12;

  const vehicles: GlobalSearchResult[] = scope === "all" || scope === "vehicle" ? listVehicles(context)
    .filter((vehicle) => matches([vehicle.plate, vehicle.make, vehicle.model, vehicle.year, vehicle.city, vehicle.status]))
    .slice(0, resultLimit)
    .map((vehicle) => ({
      id: vehicle.id,
      kind: "vehicle",
      label: `${vehicle.make} ${vehicle.model}`,
      detail: `${vehicle.plate} · ${vehicle.city} · ${vehicle.status}`,
      href: `/vehicles/${vehicle.id}`,
    })) : [];

  const bookings: GlobalSearchResult[] = scope === "all" || scope === "booking" ? listBookings(context)
    .filter((booking) => matches([booking.publicNumber, booking.customer, booking.vehicle, booking.plate, booking.status, booking.destinationCity]))
    .slice(0, resultLimit)
    .map((booking) => ({
      id: booking.id,
      kind: "booking",
      label: `Booking #${booking.publicNumber ?? booking.id}`,
      detail: `${booking.customer} · ${booking.vehicle} · ${booking.status}`,
      href: `/bookings/${booking.id}`,
    })) : [];

  const customers: GlobalSearchResult[] = scope === "all" || scope === "customer" ? listCustomers(context)
    .filter((customer) => matches([customer.name, customer.phone, customer.status]))
    .slice(0, resultLimit)
    .map((customer) => ({
      id: customer.id,
      kind: "customer",
      label: customer.name,
      detail: `${customer.phone} · ${customer.status}`,
      href: `/customers/${customer.id}`,
    })) : [];

  const owners: GlobalSearchResult[] = scope === "all" || scope === "owner" ? listOwners(context).owners
    .filter((owner) => matches([owner.id, owner.name, owner.phone, owner.email, owner.status, owner.share, owner.balanceStatus, owner.vehicleCount]))
    .slice(0, resultLimit)
    .map((owner) => ({
      id: owner.id,
      kind: "owner",
      label: owner.name,
      detail: `${owner.phone} · ${owner.vehicleCount} managed vehicle${owner.vehicleCount === 1 ? "" : "s"} · ${owner.balanceStatus}`,
      href: `/owners/${owner.id}`,
    })) : [];

  return [...vehicles, ...bookings, ...customers, ...owners].slice(0, 12);
}
