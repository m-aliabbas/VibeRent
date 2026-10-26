import "server-only";

import { randomUUID } from "node:crypto";
import { execute, queryAll, queryOne } from "@/db/query";
import { cronMatches, zonedMinute } from "@/server/jobs/cron";
import {
  jobDefinitions, jobSchedules, jobTimeZone, retryDelaySeconds,
  type EnqueueOptions, type JobHandlers, type JobName, type JobPayloads, type JobQueue,
} from "@/server/jobs/contracts";

type ClaimedJob = { id: string; name: JobName; data: string; attempts: number };

const pollIntervalMs = 1_000;
const scheduleCheckMs = 20_000;

/**
 * Job queue for the single-process SQLite runtimes (desktop and LAN). Jobs live in `background_jobs`
 * in the same database, so an enqueue inside `inTransaction()` commits or rolls back with the
 * business rows, and queued work survives an app restart.
 */
export class LocalJobQueue implements JobQueue {
  private handlers: JobHandlers = {};
  private readonly running = new Map<JobName, number>();
  private pollTimer?: NodeJS.Timeout;
  private scheduleTimer?: NodeJS.Timeout;
  private polling = false;
  private stopped = true;
  private readonly firedSchedules = new Map<JobName, string>();

  async enqueue<N extends JobName>(name: N, data: JobPayloads[N], options: EnqueueOptions = {}) {
    const now = new Date();
    const runAt = new Date(now.getTime() + (options.startAfterSeconds ?? 0) * 1000).toISOString();
    // The partial unique index on (name, singleton_key) for pending/active jobs makes duplicates a no-op.
    await execute(
      `INSERT INTO background_jobs (id,name,data,singleton_key,status,attempts,run_at,created_at,updated_at)
       VALUES (?,?,?,?,'pending',0,?,?,?) ON CONFLICT DO NOTHING`,
      [`job_${randomUUID()}`, name, JSON.stringify(data), options.singletonKey ?? null, runAt, now.toISOString(), now.toISOString()],
    );
  }

  async start(handlers: JobHandlers, options: { schedules: boolean }) {
    this.handlers = { ...this.handlers, ...handlers };
    if (!this.stopped) return;
    this.stopped = false;
    // A job left active belonged to a process that stopped mid-run; run it again.
    await execute("UPDATE background_jobs SET status='pending',updated_at=? WHERE status='active'", [new Date().toISOString()]);
    this.pollTimer = setInterval(() => void this.poll(), pollIntervalMs);
    this.pollTimer.unref();
    if (options.schedules) {
      this.scheduleTimer = setInterval(() => void this.fireSchedules(), scheduleCheckMs);
      this.scheduleTimer.unref();
    }
  }

  async stop() {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    this.pollTimer = undefined;
    this.scheduleTimer = undefined;
  }

  /** Runs due jobs until none are left; used by tests and after startup. */
  async drain(maxRounds = 50) {
    for (let round = 0; round < maxRounds; round += 1) {
      const started = await this.poll();
      if (started === 0 && [...this.running.values()].every(count => count === 0)) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  private async poll(): Promise<number> {
    if (this.polling) return 0;
    this.polling = true;
    let started = 0;
    try {
      const names = Object.keys(this.handlers) as JobName[];
      if (names.length === 0) return 0;
      const due = await queryAll<{ id: string; name: JobName }>(
        `SELECT id,name FROM background_jobs WHERE status='pending' AND run_at<=? AND name IN (${names.map(() => "?").join(",")}) ORDER BY run_at LIMIT 20`,
        [new Date().toISOString(), ...names],
      );
      for (const candidate of due) {
        if ((this.running.get(candidate.name) ?? 0) >= jobDefinitions[candidate.name].concurrency) continue;
        const job = await queryOne<ClaimedJob>(
          `UPDATE background_jobs SET status='active',attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'
           RETURNING id,name,data,attempts`,
          [new Date().toISOString(), candidate.id],
        );
        if (!job) continue;
        started += 1;
        this.running.set(job.name, (this.running.get(job.name) ?? 0) + 1);
        void this.run(job).finally(() => this.running.set(job.name, (this.running.get(job.name) ?? 1) - 1));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "jobs.local_poll_failed", message: error instanceof Error ? error.message : String(error) }));
    } finally {
      this.polling = false;
    }
    return started;
  }

  private async run(job: ClaimedJob) {
    const handler = this.handlers[job.name] as ((data: unknown, context: { jobId: string; attempt: number }) => Promise<void>) | undefined;
    const definition = jobDefinitions[job.name];
    try {
      if (!handler) throw new Error(`No handler is registered for ${job.name}.`);
      await handler(JSON.parse(job.data), { jobId: job.id, attempt: job.attempts });
      await execute("DELETE FROM background_jobs WHERE id=?", [job.id]);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const now = new Date();
      if (job.attempts > definition.retryLimit) {
        await execute("UPDATE background_jobs SET status='failed',last_error=?,updated_at=? WHERE id=?", [message, now.toISOString(), job.id]);
        console.error(JSON.stringify({ event: "jobs.failed", name: job.name, jobId: job.id, attempts: job.attempts, message }));
      } else {
        const runAt = new Date(now.getTime() + retryDelaySeconds(definition, job.attempts) * 1000).toISOString();
        await execute("UPDATE background_jobs SET status='pending',run_at=?,last_error=?,updated_at=? WHERE id=?", [runAt, message, now.toISOString(), job.id]);
      }
    }
  }

  private async fireSchedules() {
    const minute = zonedMinute(new Date(), jobTimeZone);
    for (const schedule of jobSchedules) {
      if (!this.handlers[schedule.name] || this.firedSchedules.get(schedule.name) === minute.key) continue;
      if (!cronMatches(schedule.cron, minute)) continue;
      this.firedSchedules.set(schedule.name, minute.key);
      await this.enqueue(schedule.name, {} as JobPayloads[typeof schedule.name], { singletonKey: `${schedule.name}:${minute.key}` })
        .catch(error => console.error(JSON.stringify({ event: "jobs.schedule_failed", name: schedule.name, message: error instanceof Error ? error.message : String(error) })));
    }
  }
}
