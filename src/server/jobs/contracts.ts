/**
 * Background jobs. Handlers are plain functions so the same code runs in the `worker` and
 * `wa-gateway` processes on the web deployment and in-process on desktop/LAN (SQLite).
 */

export type JobRole = "worker" | "wa-gateway";

export type JobPayloads = {
  /** Builds the PDF or text for a notification delivery. */
  "notify.render": { deliveryId: string };
  /** Sends a prepared delivery over WhatsApp. Must run where the agency's socket lives. */
  "wa.send": { deliveryId: string };
  /** Connects, unlinks or resets an agency's WhatsApp session. */
  "wa.control": { agencyId: string; action: "connect" | "disconnect" | "reset" };
  /** An owner message accepted by the gateway: a command, or a CNIC photo saved to the inbox. */
  "wa.inbound": {
    agencyId: string;
    messageId: string;
    text?: string;
    media?: { path: string; mimeType: string; fileName: string };
  };
  "recurring.post": Record<string, never>;
  "report.daily": Record<string, never>;
  "maintenance.cleanup": Record<string, never>;
};

export type JobName = keyof JobPayloads;

export type JobDefinition = {
  role: JobRole;
  /** Retries after the first attempt. */
  retryLimit: number;
  retryDelaySeconds: number;
  retryBackoff: boolean;
  /** A running attempt older than this is considered lost and retried. */
  expireInSeconds: number;
  /** Jobs of this name processed at once by one process. */
  concurrency: number;
};

export const jobDefinitions: Record<JobName, JobDefinition> = {
  "notify.render": { role: "worker", retryLimit: 5, retryDelaySeconds: 15, retryBackoff: true, expireInSeconds: 120, concurrency: 4 },
  // Delivery attempts are counted on the delivery row; the queue limit is a safety net above it.
  "wa.send": { role: "wa-gateway", retryLimit: 8, retryDelaySeconds: 30, retryBackoff: true, expireInSeconds: 120, concurrency: 4 },
  "wa.control": { role: "wa-gateway", retryLimit: 2, retryDelaySeconds: 5, retryBackoff: false, expireInSeconds: 120, concurrency: 2 },
  "wa.inbound": { role: "worker", retryLimit: 3, retryDelaySeconds: 10, retryBackoff: true, expireInSeconds: 180, concurrency: 2 },
  "recurring.post": { role: "worker", retryLimit: 2, retryDelaySeconds: 60, retryBackoff: true, expireInSeconds: 600, concurrency: 1 },
  "report.daily": { role: "worker", retryLimit: 3, retryDelaySeconds: 300, retryBackoff: false, expireInSeconds: 600, concurrency: 1 },
  "maintenance.cleanup": { role: "worker", retryLimit: 1, retryDelaySeconds: 300, retryBackoff: false, expireInSeconds: 600, concurrency: 1 },
};

export const jobNames = Object.keys(jobDefinitions) as JobName[];

/** Times are in Pakistan time, matching how agencies read their reports. */
export const jobTimeZone = "Asia/Karachi";

export const jobSchedules: Array<{ name: JobName; cron: string }> = [
  { name: "recurring.post", cron: "5 * * * *" },
  { name: "report.daily", cron: "0 12 * * *" },
  { name: "maintenance.cleanup", cron: "30 * * * *" },
];

export type EnqueueOptions = {
  /** At most one queued or running job per key; a duplicate enqueue is ignored. */
  singletonKey?: string;
  startAfterSeconds?: number;
};

export type JobContext = { jobId: string; attempt: number };

export type JobHandler<N extends JobName = JobName> = (data: JobPayloads[N], context: JobContext) => Promise<void>;

export type JobHandlers = { [N in JobName]?: JobHandler<N> };

/** Throw to have the queue retry the job later. Any other error is also retried until the limit. */
export class RetryableJobError extends Error {
  constructor(message: string, readonly code = "retryable") {
    super(message);
    this.name = "RetryableJobError";
  }
}

export interface JobQueue {
  /** Inside `inTransaction()` the job is written in that transaction and only exists if it commits. */
  enqueue<N extends JobName>(name: N, data: JobPayloads[N], options?: EnqueueOptions): Promise<void>;
  /** Starts consuming the given handlers; with `schedules`, also owns the cron schedules. */
  start(handlers: JobHandlers, options: { schedules: boolean }): Promise<void>;
  stop(): Promise<void>;
}

export function retryDelaySeconds(definition: JobDefinition, attempt: number) {
  if (!definition.retryBackoff) return definition.retryDelaySeconds;
  return Math.min(definition.retryDelaySeconds * 2 ** Math.max(0, attempt - 1), 60 * 60);
}
