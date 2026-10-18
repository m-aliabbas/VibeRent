import { apiHandler } from "@/server/api/route";
import { archiveKind } from "@/server/api/archive-kind";
import { permanentlyDeleteArchived } from "@/server/services/archive-service";

export const runtime = "nodejs";

/** Permanently deletes an archived record. This cannot be undone; confirm with the user first. */
export const DELETE = apiHandler<{ kind: string; id: string }>(({ context, params }) =>
  permanentlyDeleteArchived(context, archiveKind(params.kind), params.id), { revalidate: true });
