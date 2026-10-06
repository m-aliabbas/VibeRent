export type UpdateDownload = {
  url: string;
  sha256: string;
  size: number;
  fileName: string;
};

export type SoftwareUpdateStatus = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  publishedAt: string;
  notes: string;
  releaseUrl: string;
  download: UpdateDownload;
  checkedAt: string;
};

const releaseVersionPattern = /^\d+\.\d+\.\d+$/;

export function isReleaseVersion(value: string): boolean {
  return releaseVersionPattern.test(value);
}

export function compareReleaseVersions(left: string, right: string): number {
  if (!isReleaseVersion(left) || !isReleaseVersion(right)) {
    throw new Error("Release versions must use the major.minor.patch format.");
  }
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}
