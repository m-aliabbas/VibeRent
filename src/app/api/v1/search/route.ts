import { apiHandler } from "@/server/api/route";
import { searchAgencyRecords, type GlobalSearchScope } from "@/server/services/search-service";
import { DomainError } from "@/server/domain/errors";

export const runtime = "nodejs";

const scopes: GlobalSearchScope[] = ["all", "pages", "vehicle", "booking", "customer", "owner", "expense"];

export const GET = apiHandler(({ request, context }) => {
  const params = new URL(request.url).searchParams;
  const scope = (params.get("scope") ?? "all") as GlobalSearchScope;
  if (!scopes.includes(scope)) throw new DomainError("VALIDATION_FAILED", `scope must be one of ${scopes.join(", ")}.`, 400, { scope: "Unknown search scope." });
  return searchAgencyRecords(context, params.get("q") ?? "", scope);
});
