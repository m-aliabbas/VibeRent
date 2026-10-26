import "server-only";

import { PgBoss } from "pg-boss";
import { activePostgresTransactionClient } from "@/db/query";
import { requirePostgresUrl } from "@/db/database-target";
import {
  jobDefinitions, jobNames, jobSchedules, jobTimeZone,
  type EnqueueOptions, type JobHandlers, type JobName, type JobPayloads, type JobQueue,
} from "@/server/jobs/contracts";

const completedRetentionSeconds = 7 * 24 * 60 * 60;

/**
 * pg-boss on the application's PostgreSQL database. Every queue uses the `exclusive` policy, so with a
 * `singletonKey` at most one job per key is queued or running.
 */
export class PgBossJobQueue implements JobQueue {
  private boss?: Promise<PgBoss>;

  async enqueue<N extends JobName>(name: N, data: JobPayloads[N], options: EnqueueOptions = {}) {
    const boss = await this.instance({ supervise: false, schedule: false });
    const client = activePostgresTransactionClient();
    await boss.send(name, data, {
      singletonKey: options.singletonKey,
      startAfter: options.startAfterSeconds,
      // Write the job on the business transaction's connection so it only exists if that commits.
      db: client ? { executeSql: (text, values) => client.query(text, values) } : undefined,
    });
  }

  async start(handlers: JobHandlers, options: { schedules: boolean }) {
    const boss = await this.instance({ supervise: true, schedule: options.schedules });
    for (const name of Object.keys(handlers) as JobName[]) {
      const handler = handlers[name] as ((data: unknown, context: { jobId: string; attempt: number }) => Promise<void>) | undefined;
      if (!handler) continue;
      await boss.work<unknown>(name, { batchSize: 1, localConcurrency: jobDefinitions[name].concurrency, pollingIntervalSeconds: 1 }, async jobs => {
        for (const job of jobs) await handler(job.data, { jobId: job.id, attempt: job.retryCount + 1 });
      });
    }
    if (options.schedules) {
      for (const schedule of jobSchedules) await boss.schedule(schedule.name, schedule.cron, {}, { tz: jobTimeZone });
    }
  }

  async stop() {
    if (!this.boss) return;
    const boss = await this.boss;
    this.boss = undefined;
    await boss.stop({ graceful: true, timeout: 20_000 });
  }

  /** One pg-boss instance per process; the first caller decides whether it supervises and schedules. */
  private instance(options: { supervise: boolean; schedule: boolean }) {
    this.boss ??= (async () => {
      const boss = new PgBoss({
        connectionString: requirePostgresUrl(),
        schema: "pgboss",
        application_name: `viberent-${process.env.VIBERENT_ROLE?.trim() || "all"}`,
        max: Number(process.env.PGBOSS_POOL_MAX || 4),
        ssl: process.env.POSTGRES_SSL === "disable" ? false : undefined,
        supervise: options.supervise,
        schedule: options.schedule,
      });
      boss.on("error", error => console.error(JSON.stringify({ event: "jobs.pgboss_error", message: error instanceof Error ? error.message : String(error) })));
      await boss.start();
      for (const name of jobNames) {
        const definition = jobDefinitions[name];
        const queue = {
          policy: "exclusive" as const,
          retryLimit: definition.retryLimit,
          retryDelay: definition.retryDelaySeconds,
          retryBackoff: definition.retryBackoff,
          expireInSeconds: definition.expireInSeconds,
          deleteAfterSeconds: completedRetentionSeconds,
        };
        if (await boss.getQueue(name)) {
          const { policy: _policy, ...updatable } = queue;
          void _policy;
          await boss.updateQueue(name, updatable);
        } else {
          await boss.createQueue(name, queue);
        }
      }
      return boss;
    })().catch(error => {
      this.boss = undefined;
      throw error;
    });
    return this.boss;
  }
}
