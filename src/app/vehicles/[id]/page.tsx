import { VehicleWorkspace } from "@/components/vehicles/vehicle-workspace";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleWorkspace vehicleId={id} />;
}
