import { LegacyEntryPanel } from "@/components/legacy-entry/legacy-entry-panel";
import { getWebRequestContext } from "@/server/auth/session";
import { getVehicleFormOptions, listVehicles } from "@/server/services/vehicle-service";
import { listCustomers } from "@/server/services/customer-service";
import { listOwners } from "@/server/services/owner-service";
import { listExpenseCategories } from "@/server/services/catalog-service";

export default async function LegacyEntryPage() {
  const context=await getWebRequestContext();
  const vehicleOptions=getVehicleFormOptions(context);
  return <LegacyEntryPanel initialVehicles={listVehicles(context)} initialCustomers={listCustomers(context)} initialOwners={listOwners(context).owners} cities={[...new Set(vehicleOptions.branches.map(branch=>branch.city))]} categories={listExpenseCategories(context).map(item=>item.name)}/>;
}
