import { vehicles as vehicleFixtures } from "@/lib/mock-data";
import type { EntityRepository, RepositoryResult } from "@/lib/repositories/repository";
import type { Vehicle } from "@/types/vehicle";

const readDelay = 420;
const writeDelay = 280;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MockVehicleRepository implements EntityRepository<Vehicle> {
  private items = clone(vehicleFixtures);

  async list(): Promise<RepositoryResult<Vehicle[]>> {
    await wait(readDelay);
    return { ok: true, data: clone(this.items) };
  }

  async getById(id: string): Promise<RepositoryResult<Vehicle>> {
    await wait(readDelay);
    const vehicle = this.items.find((item) => item.id === id);
    return vehicle
      ? { ok: true, data: clone(vehicle) }
      : { ok: false, error: { code: "not_found", message: "That vehicle is no longer available." } };
  }

  async save(vehicle: Vehicle): Promise<RepositoryResult<Vehicle>> {
    await wait(writeDelay);
    const normalized = {
      ...vehicle,
      plate: vehicle.plate.trim().toUpperCase(),
      make: vehicle.make.trim(),
      model: vehicle.model.trim(),
      color: vehicle.color.trim(),
      owner: vehicle.ownership === "Managed" ? vehicle.owner?.trim() : undefined,
    };
    const duplicate = this.items.some(
      (item) => item.id !== normalized.id && item.plate.toUpperCase() === normalized.plate,
    );

    if (duplicate) {
      return {
        ok: false,
        error: {
          code: "conflict",
          field: "plate",
          message: `Plate ${normalized.plate} already belongs to another vehicle.`,
        },
      };
    }

    const index = this.items.findIndex((item) => item.id === normalized.id);
    if (index >= 0) this.items[index] = clone(normalized);
    else this.items.unshift(clone(normalized));
    return { ok: true, data: clone(normalized) };
  }

  async remove(id: string): Promise<RepositoryResult<{ id: string }>> {
    await wait(writeDelay);
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      return { ok: false, error: { code: "not_found", message: "That vehicle has already been removed." } };
    }
    this.items.splice(index, 1);
    return { ok: true, data: { id } };
  }
}

export const vehicleRepository: EntityRepository<Vehicle> = new MockVehicleRepository();
