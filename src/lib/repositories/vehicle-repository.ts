import { getVehicleAction, listVehiclesAction, saveVehicleAction } from "@/app/actions/vehicles";
import type { EntityRepository, RepositoryResult } from "@/lib/repositories/repository";
import type { Vehicle } from "@/types/vehicle";

class ServerVehicleRepository implements EntityRepository<Vehicle> {
  list() { return listVehiclesAction(); }
  getById(id: string) { return getVehicleAction(id); }
  save(vehicle: Vehicle) { return saveVehicleAction(vehicle); }
  async remove(id: string): Promise<RepositoryResult<{ id: string }>> {
    const current = await getVehicleAction(id);
    if (!current.ok) return current;
    const result = await saveVehicleAction({ ...current.data, status: "Archived" });
    return result.ok ? { ok: true, data: { id } } : result;
  }
}

export const vehicleRepository: EntityRepository<Vehicle> = new ServerVehicleRepository();
