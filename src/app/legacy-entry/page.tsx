import { LegacyEntryPanel } from "@/components/legacy-entry/legacy-entry-panel";
import { getWebRequestContext } from "@/server/auth/session";
import { getVehicleFormOptions, listVehicles } from "@/server/services/vehicle-service";
import { listCustomers } from "@/server/services/customer-service";
import { listOwners } from "@/server/services/owner-service";
import { listExpenseCategories } from "@/server/services/catalog-service";

export default async function LegacyEntryPage({searchParams}:{searchParams:Promise<{entry?:string}>}) {
  const context=await getWebRequestContext();
  const vehicleOptions=await getVehicleFormOptions(context);
  const entry=(await searchParams).entry;
  return <LegacyEntryPanel initialTab={entry==="income"||entry==="expense"?"ledger":undefined} initialKind={entry==="expense"?"expense":"income"} initialVehicles={await listVehicles(context)} initialCustomers={await listCustomers(context)} initialOwners={(await listOwners(context)).owners} cities={[...new Set(vehicleOptions.branches.map(branch=>branch.city))]} categories={(await listExpenseCategories(context)).map(item=>item.name)}/>;
}
