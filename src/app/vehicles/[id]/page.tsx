import { VehicleWorkspace } from "@/components/vehicles/vehicle-workspace";
import { vehicles } from "@/lib/mock-data";

export function generateStaticParams() {
  return vehicles.map(({ id }) => ({ id }));
}

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleWorkspace vehicleId={id} />;
}
