import { runRole } from "./run-role";

/** PDF rendering, OCR for owner WhatsApp photos, owner commands and scheduled jobs. */
runRole("worker", 3001).catch(error => {
  console.error(JSON.stringify({ event: "role.start_failed", role: "worker", message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
