import { apiHandler } from "@/server/api/route";
import { archiveKind } from "@/server/api/archive-kind";
import { restoreArchived } from "@/server/services/archive-service";

export const runtime = "nodejs";

export const POST = apiHandler<{ kind: string; id: string }>(({ context, params }) =>
  restoreArchived(context, archiveKind(params.kind), params.id), { revalidate: true });
