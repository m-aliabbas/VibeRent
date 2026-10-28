import { VehicleWorkspace } from "@/components/vehicles/vehicle-workspace";
import { getWebRequestContext } from "@/server/auth/session";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWebRequestContext();
  return <VehicleWorkspace vehicleId={id} canDeleteHistory={context.roles.includes("agency_owner")} />;
}
