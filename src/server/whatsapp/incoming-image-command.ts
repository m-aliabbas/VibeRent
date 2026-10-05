import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingWhatsAppMessage } from "./types";

const addImageCommand = /^\/add\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/i;

export type AddImageCommand = { folder: string };

export type SavedIncomingImage = {
  folder: string;
  fileName: string;
  absolutePath: string;
  savedAt: string;
};

export function parseAddImageCommand(caption: string | undefined): AddImageCommand | null {
  const match = caption?.trim().match(addImageCommand);
  if (!match || match[1].length > 40) return null;
  return { folder: match[1].toLowerCase() };
}

function imageExtension(mimeType: string | undefined) {
  switch (mimeType?.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
    case "image/heif":
      return "heic";
    default:
      return "jpg";
  }
}

function timestamp(value: Date) {
  return value.toISOString().replace(/:/g, "-").replace("T", "_").replace("Z", "");
}

export async function saveAddImageCommand(
  message: IncomingWhatsAppMessage,
  inboxRoot: string,
): Promise<SavedIncomingImage | null> {
  if (message.media?.kind !== "image") return null;
  const command = parseAddImageCommand(message.media.caption ?? message.text);
  if (!command) return null;

  const root = path.resolve(inboxRoot);
  const directory = path.join(root, command.folder);
  const safeMessageId = message.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 80) || "image";
  const fileName = `${timestamp(message.receivedAt)}_${safeMessageId}.${imageExtension(message.media.mimeType)}`;
  const absolutePath = path.join(directory, fileName);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    const bytes = await message.media.download();
    await fs.writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  return {
    folder: command.folder,
    fileName,
    absolutePath,
    savedAt: new Date().toISOString(),
  };
}
