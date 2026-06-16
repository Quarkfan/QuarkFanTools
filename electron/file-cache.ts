import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { BotConfig, LarkMessage } from "./types.js";

export async function cacheMessageResources(bot: BotConfig, message: LarkMessage): Promise<void> {
  for (const resource of message.resources) {
    if (!resource.localPath) continue;
    await cacheFile(bot, resource.localPath, resource.name);
  }
}

export async function cacheWorkspaceFiles(bot: BotConfig, root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === "skills") continue;
    const target = path.join(root, entry.name);
    const info = await lstat(target).catch(() => null);
    if (!info || info.isSymbolicLink()) continue;
    if (info.isDirectory()) await cacheWorkspaceFiles(bot, target);
    else if (info.size <= 200 * 1024 * 1024) await cacheFile(bot, target);
  }
}

async function cacheFile(bot: BotConfig, source: string, preferredName?: string): Promise<void> {
  const content = await readFile(source);
  const hash = createHash("sha256").update(content).digest("hex");
  const root = path.join(stateRoot(), "file-cache", hash);
  await mkdir(root, { recursive: true });
  const fileName = preferredName || path.basename(source);
  await copyFile(source, path.join(root, fileName));
  const metadataPath = path.join(root, "metadata.json");
  const existing: { botIds?: string[] } = await readFile(metadataPath, "utf8")
    .then((value) => JSON.parse(value) as { botIds?: string[] })
    .catch(() => ({}));
  await writeFile(metadataPath, `${JSON.stringify({
    hash,
    fileName,
    bytes: content.byteLength,
    cachedAt: new Date().toISOString(),
    botIds: [...new Set([...(existing.botIds ?? []), bot.id])]
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
