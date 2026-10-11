"use server";

import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { getVehicle, getVehicleFinance, getVehicleFormOptions, listVehicles, saveVehicle, setVehicleArchived, transitionVehicleStatus } from "@/server/services/vehicle-service";
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

export async function getVehicleFinanceAction(id: string) {
  try { return { ok: true as const, data: getVehicleFinance(await getWebRequestContext(), id) }; }
  catch (error) { return failure(error); }
}

export async function saveVehicleAction(vehicle: Vehicle): Promise<RepositoryResult<Vehicle>> {
  try { return { ok: true, data: saveVehicle(await getWebRequestContext(), vehicle) }; } catch (error) { return failure(error); }
}

export async function transitionVehicleStatusAction(id: string, input: Parameters<typeof transitionVehicleStatus>[2]): Promise<RepositoryResult<Vehicle>> {
  try {
    const data = transitionVehicleStatus(await getWebRequestContext(), id, input);
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${id}`);
    revalidatePath("/bookings/new");
    return { ok: true, data };
  } catch (error) { return failure(error); }
}

export async function setVehicleArchivedAction(id:string,archived:boolean):Promise<RepositoryResult<Vehicle>> {
  try {
    const data=setVehicleArchived(await getWebRequestContext(),id,archived);
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${id}`);
    return {ok:true,data};
  } catch(error) { return failure(error); }
}

export async function getVehicleFormOptionsAction() {
  try { return { ok: true as const, data: getVehicleFormOptions(await getWebRequestContext()) }; }
  catch (error) { const issue=asDomainError(error); return { ok: false as const, error: {code:issue.code,message:issue.message} }; }
}
