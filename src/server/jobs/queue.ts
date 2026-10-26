import "server-only";

import { getDatabaseTarget } from "@/db/database-target";
import type { EnqueueOptions, JobName, JobPayloads, JobQueue } from "@/server/jobs/contracts";

const queueGlobal = globalThis as typeof globalThis & { __viberentJobQueue?: Promise<JobQueue> };

/** pg-boss on the PostgreSQL web deployment; the SQLite-backed runner on desktop and LAN. */
export function getJobQueue(): Promise<JobQueue> {
  queueGlobal.__viberentJobQueue ??= (async () => {
    if (getDatabaseTarget() === "postgres") {
      const { PgBossJobQueue } = await import("@/server/jobs/pg-boss-queue");
      return new PgBossJobQueue();
    }
    const { LocalJobQueue } = await import("@/server/jobs/local-queue");
    return new LocalJobQueue();
  })();
  return queueGlobal.__viberentJobQueue;
}

export async function enqueueJob<N extends JobName>(name: N, data: JobPayloads[N], options?: EnqueueOptions) {
  await (await getJobQueue()).enqueue(name, data, options);
}
