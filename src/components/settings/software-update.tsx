"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SoftwareUpdateStatus } from "@/lib/software-update";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function fetchStatus(): Promise<SoftwareUpdateStatus> {
  const response = await fetch("/api/v1/desktop/update", { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { data?: SoftwareUpdateStatus; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message || "The update check could not be completed.");
  return payload.data;
}

function browserDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function SoftwareUpdate({ onNotice }: { onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<SoftwareUpdateStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    setChecking(true);
    setError("");
    try { setStatus(await fetchStatus()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The update check failed."); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(timer);
  }, [check]);

  async function downloadUpdate() {
    if (!status?.updateAvailable || downloading) return;
    setDownloading(true);
    setError("");
    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = await invoke<string>("download_update", {
          url: status.download.url,
          filename: status.download.fileName,
          sha256: status.download.sha256,
        });
        try {
          const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
          await revealItemInDir(path);
        } catch { /* The verified installer is already saved. */ }
        onNotice(`VibeRent ${status.latestVersion} downloaded and verified. Open the installer from Downloads when ready.`);
      } else {
        browserDownload(status.download.url);
        onNotice(`VibeRent ${status.latestVersion} download opened in your browser.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The update could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  async function openReleaseDetails() {
    if (!status) return;
    if (isTauri()) {
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(status.releaseUrl);
        return;
      } catch { /* Fall through to the browser navigation. */ }
    }
    browserDownload(status.releaseUrl);
  }

  return <section className="rounded-xl border bg-white">
    <div className="flex gap-3 border-b p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><RefreshCw size={19}/></span>
      <div><h2 className="font-bold">Software update</h2><p className="mt-1 text-xs text-[#667085]">Check the official VibeRent GitHub release and download a verified Windows installer.</p></div>
    </div>
    <div className="p-5">
      {error && <div role="alert" className="mb-4 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</div>}
      {checking && !status ? <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-[#475467]"><LoaderCircle className="animate-spin text-[#006FE6]" size={18}/>Checking GitHub for updates…</div> : status ? <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={status.updateAvailable ? "Update available" : "Up to date"}/><span className="text-sm font-semibold">Installed: v{status.currentVersion}</span></div>
            <h3 className="mt-3 text-lg font-bold text-[#19191F]">{status.updateAvailable ? `VibeRent ${status.latestVersion} is ready` : "You have the latest version"}</h3>
            <p className="mt-1 text-sm text-[#475467]">{status.updateAvailable ? status.notes || "A newer VibeRent release is available." : `Latest release: v${status.latestVersion}`}</p>
          </div>
          <Button variant="secondary" size="sm" disabled={checking || downloading} onClick={() => void check()}>{checking ? <LoaderCircle className="animate-spin" size={15}/> : <RefreshCw size={15}/>}Check again</Button>
        </div>

        {status.updateAvailable && <div className="rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] p-4">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#006FE6]" size={20}/><div><p className="text-sm font-semibold text-[#1849A9]">Verified download</p><p className="mt-1 text-xs leading-5 text-[#344054]">The installer is saved to Downloads only after its SHA-256 matches the release manifest. Installing the update does not replace your database, private files, or backups.</p></div></div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><Button disabled={downloading} onClick={() => void downloadUpdate()}>{downloading ? <LoaderCircle className="animate-spin" size={16}/> : <Download size={16}/>} {downloading ? "Downloading and verifying…" : `Download update · ${formatBytes(status.download.size)}`}</Button><Button variant="ghost" onClick={() => void openReleaseDetails()}><ExternalLink size={15}/>Release details</Button></div>
          <p className="mt-3 text-xs text-[#667085]">The current Windows installer is not code-signed, so Windows may show a security warning before installation.</p>
        </div>}

        {!status.updateAvailable && <div className="flex gap-3 rounded-xl bg-[#ECFDF3] p-4 text-sm text-[#067647]"><CheckCircle2 className="shrink-0" size={19}/><span>VibeRent v{status.currentVersion} is current. No download is needed.</span></div>}

        <dl className="grid gap-3 rounded-xl bg-[#F8FAFC] p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-[#667085]">Latest release</dt><dd className="mt-1 font-semibold">v{status.latestVersion}</dd></div>
          <div><dt className="text-xs text-[#667085]">Published</dt><dd className="mt-1 font-semibold">{formatDate(status.publishedAt)}</dd></div>
          <div><dt className="text-xs text-[#667085]">Last checked</dt><dd className="mt-1 font-semibold">{formatDate(status.checkedAt)}</dd></div>
        </dl>
      </div> : <div className="flex min-h-28 items-center justify-center"><Button variant="secondary" onClick={() => void check()}><RefreshCw size={16}/>Try again</Button></div>}
    </div>
  </section>;
}
