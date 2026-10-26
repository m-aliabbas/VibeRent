import http from "node:http";
import { startBackgroundRoles } from "@/server/jobs/background";
import type { JobRole } from "@/server/jobs/contracts";

/**
 * Entry point shared by the standalone `worker` and `wa-gateway` processes: start the role, answer
 * health checks, and shut down gracefully so in-flight jobs finish and WhatsApp leases are released.
 */
export async function runRole(role: JobRole, defaultHealthPort: number) {
  process.env.VIBERENT_ROLE = role;
  const stop = await startBackgroundRoles([role]);
  let stopping = false;

  const port = Number(process.env.HEALTH_PORT || defaultHealthPort);
  const server = http.createServer((request, response) => {
    const healthy = !stopping && request.url === "/health";
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: healthy ? "ok" : "unavailable", service: `viberent-${role}`, version: process.env.VIBERENT_VERSION ?? "development" }));
  });
  server.listen(port, "0.0.0.0");

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(JSON.stringify({ event: "role.stopping", role, signal }));
    const forceExit = setTimeout(() => process.exit(1), 25_000);
    forceExit.unref();
    try {
      await stop();
    } finally {
      server.close();
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  console.info(JSON.stringify({ event: "role.ready", role, healthPort: port }));
}
