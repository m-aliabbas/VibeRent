"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { getVehicle, listVehicles, saveVehicle } from "@/server/services/vehicle-service";
import type { Vehicle } from "@/types/vehicle";
import type { RepositoryResult } from "@/lib/repositories/repository";

function failure(error: unknown): RepositoryResult<never> {
  const issue = asDomainError(error);
  return { ok: false, error: { code: issue.code === "NOT_FOUND" ? "not_found" : issue.status === 409 ? "conflict" : "validation", message: issue.message, field: issue.fieldErrors ? Object.keys(issue.fieldErrors)[0] : undefined } };
}

export async function listVehiclesAction(): Promise<RepositoryResult<Vehicle[]>> {
  try { return { ok: true, data: listVehicles(await getWebRequestContext()) }; } catch (error) { return failure(error); }
}

export async function getVehicleAction(id: string): Promise<RepositoryResult<Vehicle>> {
  try { return { ok: true, data: getVehicle(await getWebRequestContext(), id) }; } catch (error) { return failure(error); }
}

export async function saveVehicleAction(vehicle: Vehicle): Promise<RepositoryResult<Vehicle>> {
  try { return { ok: true, data: saveVehicle(await getWebRequestContext(), vehicle) }; } catch (error) { return failure(error); }
}

