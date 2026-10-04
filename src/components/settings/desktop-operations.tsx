"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cloud,
  DatabaseBackup,
  Download,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";

type BackupFile = { filename: string; size: number; createdAt: string; kind: string };
type DriveFile = { fileId: string; filename: string; size: number; createdAt: string | null };
type DesktopStatus = {
  desktop: boolean;
  license: { enforced: boolean; state: string; fingerprint: string; message: string; expiresAt?: string };
  backup: { databasePath: string; databaseSize: number; backupSuffix: string; backups: BackupFile[] };
  scheduler: { running: boolean; nextRun: string | null; lastSuccess: string | null; lastError: string | null; hour: number; retentionDays: number };
  googleDrive: { configured: boolean; connected: boolean; account: { displayName?: string | null; email?: string | null } | null; folderName: string };
};

type RestoreTarget = { type: "local"; file: File } | { type: "drive"; file: DriveFile };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({})) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message || "The operation could not be completed.");
  }
  return payload.data;
}

function bytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not yet";
}

function Card({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-xl border bg-white"><div className="flex gap-3 border-b p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]">{icon}</span><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-[#667085]">{description}</p></div></div><div className="p-5">{children}</div></section>;
}

export function DesktopOperations({ onNotice }: { onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await api<DesktopStatus>("/api/v1/backups/status");
      setStatus(next);
      if (next.googleDrive.connected) {
        setDriveFiles(await api<DriveFile[]>("/api/v1/backups/google-drive/files"));
      } else setDriveFiles([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup status could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function run(label: string, operation: () => Promise<void>) {
    setBusy(label);
    setError("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The operation failed."); }
    finally { setBusy(null); }
  }

  async function createLocalBackup() {
    await run("create", async () => {
      const result = await api<{ backup: BackupFile; driveUpload: DriveFile | null; driveError: string | null }>("/api/v1/backups/create", { method: "POST" });
      onNotice(result.driveUpload ? "Backup created locally and uploaded to Google Drive." : result.driveError ? `Local backup created. Drive upload failed: ${result.driveError}` : "Local backup created.");
      await load();
    });
  }

  async function connectDrive() {
    await run("connect", async () => {
      const { authorizationUrl } = await api<{ authorizationUrl: string }>("/api/v1/backups/google-drive/connect", { method: "POST" });
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(authorizationUrl);
      } catch {
        window.open(authorizationUrl, "viberent-google-drive", "popup,width=640,height=760");
      }
      onNotice("Complete Google sign-in in the browser window, then refresh backup status.");
    });
  }

  async function disconnectDrive() {
    await run("disconnect", async () => {
      await api("/api/v1/backups/google-drive/disconnect", { method: "DELETE" });
      onNotice("Google Drive disconnected from this installation.");
      await load();
    });
  }

  async function uploadDriveBackup() {
    await run("upload", async () => {
      await api("/api/v1/backups/google-drive/upload", { method: "POST" });
      onNotice("A fresh backup was uploaded to Google Drive.");
      await load();
    });
  }

  async function restore() {
    if (!restoreTarget) return;
    await run("restore", async () => {
      if (restoreTarget.type === "local") {
        const form = new FormData();
        form.set("file", restoreTarget.file);
        form.set("confirmation", "RESTORE");
        await api("/api/v1/backups/restore", { method: "POST", body: form });
      } else {
        await api(`/api/v1/backups/google-drive/restore/${encodeURIComponent(restoreTarget.file.fileId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation: "RESTORE" }),
        });
      }
      setRestoreTarget(null);
      onNotice("Restore staged safely. Close and reopen VibeRent to apply it.");
      await load();
    });
  }

  if (!status && !error) return <div className="grid min-h-48 place-items-center rounded-xl border bg-white"><LoaderCircle className="animate-spin text-[#006FE6]" /></div>;
  if (!status) return <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] p-5 text-sm text-[#B42318]">{error}</div>;

  return <div className="space-y-5">
    {error && <div role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</div>}

    <div className="grid gap-5 xl:grid-cols-2">
      <Card icon={<ShieldCheck size={19}/>} title="Desktop license" description="Firebase-backed device approval with a signed offline license.">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><StatusBadge status={status.license.enforced ? status.license.state : "Development"}/><p className="mt-2 text-sm text-[#475467]">{status.license.message}</p></div><Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void run("license", async () => { await api("/api/v1/desktop/license/refresh", { method: "POST" }); await load(); onNotice("License status refreshed."); })}><RefreshCw size={15}/>Refresh</Button></div>
        <div className="mt-4 rounded-lg bg-[#F8FAFC] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Device fingerprint</p><code className="mt-1 block break-all text-xs text-[#344054]">{status.license.fingerprint}</code>{status.license.expiresAt && <p className="mt-2 text-xs text-[#667085]">Expires {date(status.license.expiresAt)}</p>}</div>
      </Card>

      <Card icon={<Cloud size={19}/>} title="Google Drive" description={`Backups are stored in the ${status.googleDrive.folderName} folder using limited Drive access.`}>
        {!status.googleDrive.configured ? <p className="text-sm text-[#B54708]">Google OAuth is not configured in this desktop build.</p> : status.googleDrive.connected ? <div className="space-y-4"><div><StatusBadge status="Connected"/><p className="mt-2 text-sm text-[#475467]">{status.googleDrive.account?.displayName || "Google account"}{status.googleDrive.account?.email ? ` · ${status.googleDrive.account.email}` : ""}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy !== null} onClick={() => void uploadDriveBackup()}><Upload size={15}/>Back up to Drive</Button><Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void disconnectDrive()}>Disconnect</Button></div></div> : <div className="space-y-3"><p className="text-sm text-[#475467]">Connect the agency&apos;s Google account for off-device recovery.</p><Button size="sm" disabled={busy !== null} onClick={() => void connectDrive()}><Cloud size={15}/>Connect Google Drive</Button></div>}
      </Card>
    </div>

    <Card icon={<DatabaseBackup size={19}/>} title="Backup and recovery" description="Each archive includes a consistent SQLite snapshot and private vehicle attachments.">
      <div className="grid gap-3 rounded-xl bg-[#F8FAFC] p-4 sm:grid-cols-3"><div><p className="text-xs text-[#667085]">Database</p><p className="mt-1 font-semibold">{status.backup.databasePath}</p><p className="text-xs text-[#667085]">{bytes(status.backup.databaseSize)}</p></div><div><p className="text-xs text-[#667085]">Automatic schedule</p><p className="mt-1 font-semibold">Daily at {String(status.scheduler.hour).padStart(2, "0")}:00</p><p className="text-xs text-[#667085]">{status.scheduler.retentionDays}-day local retention</p></div><div><p className="text-xs text-[#667085]">Last success</p><p className="mt-1 font-semibold">{date(status.scheduler.lastSuccess)}</p><p className="text-xs text-[#667085]">Next: {date(status.scheduler.nextRun)}</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy !== null} onClick={() => void createLocalBackup()}>{busy === "create" ? <LoaderCircle className="animate-spin" size={16}/> : <HardDrive size={16}/>}Create backup</Button><Button variant="secondary" disabled={busy !== null} onClick={() => uploadRef.current?.click()}><Upload size={16}/>Restore from file</Button><input ref={uploadRef} className="sr-only" type="file" accept=".tgz,application/gzip" onChange={event => { const file = event.target.files?.[0]; if (file) setRestoreTarget({ type: "local", file }); event.currentTarget.value = ""; }}/><Button variant="ghost" disabled={busy !== null} onClick={() => void load()}><RefreshCw size={16}/>Refresh</Button></div>
      {status.scheduler.lastError && <p className="mt-3 text-sm text-[#B42318]">Last automatic backup error: {status.scheduler.lastError}</p>}

      <div className="mt-5"><h3 className="text-sm font-bold">Local backups</h3>{status.backup.backups.length ? <div className="mt-2 divide-y rounded-xl border">{status.backup.backups.slice(0, 10).map(item => <div key={item.filename} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs">{item.filename}</p><p className="mt-1 text-xs text-[#667085]">{date(item.createdAt)} · {bytes(item.size)} · {item.kind}</p></div><Button asChild size="sm" variant="secondary"><a href={`/api/v1/backups/download/${encodeURIComponent(item.filename)}`}><Download size={15}/>Download</a></Button></div>)}</div> : <p className="mt-2 text-sm text-[#667085]">No local backups yet.</p>}</div>

      {status.googleDrive.connected && <div className="mt-5"><h3 className="text-sm font-bold">Google Drive backups</h3>{driveFiles.length ? <div className="mt-2 divide-y rounded-xl border">{driveFiles.slice(0, 10).map(item => <div key={item.fileId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs">{item.filename}</p><p className="mt-1 text-xs text-[#667085]">{date(item.createdAt)} · {bytes(item.size)}</p></div><Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setRestoreTarget({ type: "drive", file: item })}>Restore</Button></div>)}</div> : <p className="mt-2 text-sm text-[#667085]">No compatible Drive backups yet.</p>}</div>}
    </Card>

    <ConfirmDialog open={restoreTarget !== null} onOpenChange={open => !open && setRestoreTarget(null)} title="Stage this backup for restore?" description="VibeRent will create a safety backup now. The selected database and private files will replace current data the next time the desktop application starts." confirmLabel="Stage restore" pending={busy === "restore"} pendingLabel="Validating backup…" onConfirm={() => void restore()}/>
  </div>;
}
