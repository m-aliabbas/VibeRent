import { VehiclesListPage } from "@/components/vehicles/vehicles-list-page";
import { getWebRequestContext } from "@/server/auth/session";
import { listVehicles } from "@/server/services/vehicle-service";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  // Demo states (loading/error/empty) are driven client-side for QA, so skip the server fetch for them.
  if ((await searchParams).demo) return <VehiclesListPage />;
  return <VehiclesListPage initialVehicles={await listVehicles(await getWebRequestContext())} />;
}
