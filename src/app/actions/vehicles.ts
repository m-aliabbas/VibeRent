"use server";

import { revalidatePath } from "next/cache";
import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { getVehicle, getVehicleFinance, getVehicleFormOptions, listVehicles, saveVehicle, setVehicleArchived, transitionVehicleStatus } from "@/server/services/vehicle-service";
import { getOilChangeOverview, recordOilChange, setOilChangeInterval, voidOilChange, type RecordOilChangeInput } from "@/server/services/oil-change-service";
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
    revalidatePath("/bookings/new");
    revalidatePath("/");
    return {ok:true,data};
  } catch(error) { return failure(error); }
}

export async function getVehicleFormOptionsAction() {
  try { return { ok: true as const, data: getVehicleFormOptions(await getWebRequestContext()) }; }
  catch (error) { const issue=asDomainError(error); return { ok: false as const, error: {code:issue.code,message:issue.message} }; }
}

function oilChangeFailure(error: unknown) {
  const issue = asDomainError(error);
  return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } };
}

function revalidateOilChange(vehicleId: string) {
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/expenses");
}

export async function getOilChangeOverviewAction(vehicleId: string) {
  try { return { ok: true as const, data: getOilChangeOverview(await getWebRequestContext(), vehicleId) }; }
  catch (error) { return oilChangeFailure(error); }
}

export async function recordOilChangeAction(vehicleId: string, input: RecordOilChangeInput) {
  try {
    const data = recordOilChange(await getWebRequestContext(), vehicleId, input);
    revalidateOilChange(vehicleId);
    return { ok: true as const, data };
  } catch (error) { return oilChangeFailure(error); }
}

export async function setOilChangeIntervalAction(vehicleId: string, intervalKm: number) {
  try {
    const data = setOilChangeInterval(await getWebRequestContext(), vehicleId, intervalKm);
    revalidateOilChange(vehicleId);
    return { ok: true as const, data };
  } catch (error) { return oilChangeFailure(error); }
}

export async function voidOilChangeAction(vehicleId: string, recordId: string, reason: string) {
  try {
    const data = voidOilChange(await getWebRequestContext(), vehicleId, recordId, reason);
    revalidateOilChange(vehicleId);
    return { ok: true as const, data };
  } catch (error) { return oilChangeFailure(error); }
}
