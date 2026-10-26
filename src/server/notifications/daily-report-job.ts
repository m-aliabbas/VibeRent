import "server-only";

import { listDailyReportAgencies, previousPakistanDay } from "@/server/notifications/daily-report";
import { queueSystemNotification } from "@/server/notifications/notification-service";

/** Daily job: queue yesterday's report for every agency with an owner number. Each agency gets it once per day. */
export async function queueDailyReports(now = new Date()) {
  const { day } = previousPakistanDay(now);
  for (const { agencyId } of await listDailyReportAgencies()) {
    await queueSystemNotification(agencyId, { kind: "report.daily", entityId: day, payload: { day }, idempotencyKey: `report.daily:${day}` });
  }
}
