"use client";

type DownloadResult = { path?: string; fileName: string };

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function browserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function responseFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* use fallback parser */ }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

export async function saveBlob(blob: Blob, fileName: string): Promise<DownloadResult> {
  if (!isTauri()) {
    browserDownload(blob, fileName);
    return { fileName };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  const path = await invoke<string>("save_download", { filename: fileName, bytes });
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch {
    // The file is already safely stored even if Explorer cannot be opened.
  }
  return { path, fileName };
}

export async function downloadFromUrl(url: string, fallbackFileName: string): Promise<DownloadResult> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Download failed (${response.status}).`);
  }
  return saveBlob(await response.blob(), responseFileName(response, fallbackFileName));
}
