import { apiHandler, readJsonObject } from "@/server/api/route";
import { recordDatedLedgerEntry, type DatedLedgerInput } from "@/server/services/legacy-entry-service";

export const runtime="nodejs";

/** Posts a standalone dated income or expense entry. */
export const POST=apiHandler(async({request,context})=>recordDatedLedgerEntry(context,await readJsonObject(request) as DatedLedgerInput),{status:201,revalidate:true});
