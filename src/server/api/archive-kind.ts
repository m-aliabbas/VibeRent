import { archiveKinds, type ArchiveKind } from "@/server/services/archive-service";
import { DomainError } from "@/server/domain/errors";

export function archiveKind(value: string): ArchiveKind {
  if (!(archiveKinds as string[]).includes(value)) throw new DomainError("VALIDATION_FAILED", `Archive kind must be one of ${archiveKinds.join(", ")}.`, 400, { kind: "Unknown archive kind." });
  return value as ArchiveKind;
}
