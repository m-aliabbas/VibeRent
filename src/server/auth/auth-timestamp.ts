import { getDatabaseTarget, type DatabaseTarget } from "@/db/database-target";

export function authTimestamp(date: Date, target: DatabaseTarget = getDatabaseTarget()): Date | number {
  return target === "postgres" ? date : date.getTime();
}
