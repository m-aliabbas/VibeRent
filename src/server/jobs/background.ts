import "server-only";

import type { JobHandlers, JobRole } from "@/server/jobs/contracts";
import { getJobQueue } from "@/server/jobs/queue";

export type ProcessRole = "web" | "worker" | "wa-gateway" | "all";

/**
 * Which background work this process runs, from `VIBERENT_ROLE`.
 * - `web`: HTTP only; background work runs in the `worker` and `wa-gateway` containers.
 * - `all` (default): everything in one process, as on desktop, LAN and a single-container install.
 */
export function getProcessRole(env: NodeJS.ProcessEnv = process.env): ProcessRole {
  const value = env.VIBERENT_ROLE?.trim().toLowerCase();
  if (!value) return "all";
  if (value === "web" || value === "worker" || value === "wa-gateway" || value === "all") return value;
  throw new Error("VIBERENT_ROLE must be one of web, worker, wa-gateway or all.");
}

export function jobRolesFor(role: ProcessRole): JobRole[] {
  if (role === "all") return ["worker", "wa-gateway"];
  return role === "web" ? [] : [role];
}

/** Starts the job consumers (and, for `wa-gateway`, the WhatsApp sockets) for the given roles. */
export async function startBackgroundRoles(roles: JobRole[]) {
  if (roles.length === 0) return async () => undefined;
  const queue = await getJobQueue();
  const handlers: JobHandlers = {};
  const gateway = roles.includes("wa-gateway") ? await import("@/server/whatsapp/gateway") : undefined;
  if (roles.includes("worker")) Object.assign(handlers, await workerHandlers());
  if (gateway) {
    await gateway.startWhatsAppGateway();
    Object.assign(handlers, gateway.gatewayHandlers);
  }
  await queue.start(handlers, { schedules: roles.includes("worker") });
  // Catch up on recurring charges that fell due while no worker was running.
  if (roles.includes("worker")) await queue.enqueue("recurring.post", {}, { singletonKey: "startup" });
  console.info(JSON.stringify({ event: "jobs.started", roles }));
  return async () => {
    await queue.stop();
    await gateway?.stopWhatsAppGateway();
  };
}

async function workerHandlers(): Promise<JobHandlers> {
  const [{ renderNotificationJob }, { handleInboundJob }, { runRecurringExpensePosting }, { queueDailyReports }, { runMaintenance }] = await Promise.all([
    import("@/server/notifications/render-job"),
    import("@/server/whatsapp/inbound-job"),
    import("@/server/services/recurring-expense-service"),
    import("@/server/notifications/daily-report-job"),
    import("@/server/jobs/maintenance"),
  ]);
  return {
    "notify.render": renderNotificationJob,
    "wa.inbound": handleInboundJob,
    "recurring.post": async () => { await runRecurringExpensePosting(); },
    "report.daily": async () => { await queueDailyReports(); },
    "maintenance.cleanup": async () => { await runMaintenance(); },
  };
}
