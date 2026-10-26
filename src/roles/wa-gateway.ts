import { runRole } from "./run-role";

/** Owns the agencies' WhatsApp sockets and sends queued deliveries. Run one instance. */
runRole("wa-gateway", 3002).catch(error => {
  console.error(JSON.stringify({ event: "role.start_failed", role: "wa-gateway", message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
