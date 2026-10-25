import { apiHandler, readMultipart, requireFile } from "@/server/api/route";
import { requireRole } from "@/server/auth/authorize";
import { readOdometerPhoto } from "@/server/services/odometer-ocr-service";

export const runtime = "nodejs";

/** Reads the odometer (km) from a dashboard photo (multipart `image`). Returns `{ odometer: number | null }`. */
export const POST = apiHandler(async ({ request, context }) => {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const form = await readMultipart(request);
  return readOdometerPhoto(requireFile(form, "image", "Take a photo of the odometer."));
});
