import type { JobRole } from "@/server/jobs/contracts";

// Node-only startup. Imported from instrumentation.ts behind a NEXT_RUNTIME check so the
// Edge instrumentation bundle never traces better-sqlite3 or other native modules.
export async function registerNode() {
  if (process.env.VIBERENT_DESKTOP === "1") {
    const { prepareDesktopRuntime } = await import("@/server/desktop/startup");
    const { licensed } = await prepareDesktopRuntime();
    // Started after any desktop restore and migrations so the database is final before it is opened.
    // WhatsApp, as before, only runs on an active (or unenforced) licence.
    await startRoles(licensed ? ["worker", "wa-gateway"] : ["worker"]);
    return;
  }
  // `web` serves HTTP only; the worker and WhatsApp gateway then run as their own processes.
  const { getProcessRole, jobRolesFor } = await import("@/server/jobs/background");
  await startRoles(jobRolesFor(getProcessRole()));
}

async function startRoles(roles: JobRole[]) {
  try {
    const { startBackgroundRoles } = await import("@/server/jobs/background");
    await startBackgroundRoles(roles);
  } catch (error) {
    console.error(JSON.stringify({ event: "jobs.start_failed", roles, message: error instanceof Error ? error.message : String(error) }));
  }
}
