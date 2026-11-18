import { apiHandler, readJsonObject } from "@/server/api/route";
import { payCustomerBalance } from "@/server/services/customer-service";

export const runtime="nodejs";

/** Allocates a customer payment to open bookings, oldest first (FIFO). Optional `paidOn` (YYYY-MM-DD) dates the ledger entries. */
export const POST=apiHandler<{id:string}>(async({request,context,params})=>payCustomerBalance(context,params.id,await readJsonObject(request) as Parameters<typeof payCustomerBalance>[2]),{status:201,revalidate:true});
