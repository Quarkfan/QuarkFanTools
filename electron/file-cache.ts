import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { removeFileCacheIndexEntry, summarizeFileCacheIndex, type CacheIndexEntry } from "./file-cache-index.js";
import { stateRoot } from "./paths.js";
import type { BotConfig, FileCacheEntrySummary, LarkMessage, LarkMessageResource } from "./types.js";

interface CacheMetadata {
  hash: string;
  fileName: string;
  bytes: number;
  cachedAt: string;
  botIds: string[];
}

export interface LarkFileCacheRequest {
  type: "lark-drive-file" | "lark-drive-export";
  fileToken: string;
  docType?: string;
  fileExtension?: string;
  freshnessKey?: string;
  outputName?: string;
}

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

export async function materializeCachedMessageResource(bot: BotConfig, resource: LarkMessageResource, outputDir: string): Promise<LarkMessageResource | null> {
  const index = await readIndex();
  const entry = index[messageResourceCacheKey(bot, resource)];
  if (!entry || !entry.botIds.includes(bot.id)) return null;
  const source = path.join(cacheRoot(), entry.hash, entry.fileName);
  const outputName = resource.name || entry.fileName || resource.key;
  const target = path.join(outputDir, outputName);
  try {
    await mkdir(outputDir, { recursive: true });
    await copyFile(source, target);
    return { ...resource, localPath: target };
  } catch {
    return null;
  }
}

export async function cacheDownloadedMessageResource(bot: BotConfig, resource: LarkMessageResource): Promise<void> {
  if (!resource.localPath) return;
  await cacheFile(bot, resource.localPath, resource.name, {
    type: "lark-message-resource",
    botId: bot.id,
    messageResourceType: resource.type,
    key: resource.key,
    name: resource.name
  });
}

export async function materializeCachedLarkFile(bot: BotConfig, request: LarkFileCacheRequest, outputDir: string): Promise<string | null> {
  const index = await readIndex();
  const entry = index[larkFileCacheKey(bot, request)];
  if (!entry || !entry.botIds.includes(bot.id)) return null;
  const source = path.join(cacheRoot(), entry.hash, entry.fileName);
  const target = path.join(outputDir, request.outputName || entry.fileName);
  try {
    await mkdir(outputDir, { recursive: true });
    await copyFile(source, target);
    return target;
  } catch {
    return null;
  }
}

export async function cacheDownloadedLarkFile(bot: BotConfig, request: LarkFileCacheRequest, localPath: string): Promise<void> {
  await cacheFile(bot, localPath, request.outputName || path.basename(localPath), {
    type: request.type,
    botId: bot.id,
    fileToken: request.fileToken,
    docType: request.docType,
    fileExtension: request.fileExtension,
    freshnessKey: request.freshnessKey
  });
}

export async function fileCacheEntries(): Promise<FileCacheEntrySummary[]> {
  const index = await readIndex();
  return summarizeFileCacheIndex(index);
}

export async function removeFileCacheEntry(cacheKey: string): Promise<boolean> {
  const index = await readIndex();
  const result = removeFileCacheIndexEntry(index, cacheKey);
  if (!result.removed) return false;
  await writeIndex(index);
  if (result.orphanedHash) {
    await rm(path.join(cacheRoot(), result.orphanedHash), { recursive: true, force: true });
  }
  return true;
}

async function cacheFile(
  bot: BotConfig,
  source: string,
  preferredName?: string,
  indexSource?: CacheIndexEntry["source"]
): Promise<void> {
  const content = await readFile(source);
  const hash = createHash("sha256").update(content).digest("hex");
  const root = path.join(cacheRoot(), hash);
  await mkdir(root, { recursive: true });
  const fileName = preferredName || path.basename(source);
  await copyFile(source, path.join(root, fileName));
  const metadataPath = path.join(root, "metadata.json");
  const existing: Partial<CacheMetadata> = await readFile(metadataPath, "utf8")
    .then((value) => JSON.parse(value) as Partial<CacheMetadata>)
    .catch(() => ({}));
  const metadata: CacheMetadata = {
    hash,
    fileName,
    bytes: content.byteLength,
    cachedAt: new Date().toISOString(),
    botIds: [...new Set([...(existing.botIds ?? []), bot.id])]
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (indexSource) {
    const index = await readIndex();
    const cacheKey = indexSource.type === "lark-message-resource"
      ? messageResourceCacheKey(bot, { key: indexSource.key, type: indexSource.messageResourceType, name: indexSource.name })
      : larkFileCacheKey(bot, {
        type: indexSource.type,
        fileToken: indexSource.fileToken,
        docType: indexSource.docType,
        fileExtension: indexSource.fileExtension,
        freshnessKey: indexSource.freshnessKey
      });
    index[cacheKey] = {
      cacheKey,
      hash,
      fileName,
      bytes: content.byteLength,
      botIds: metadata.botIds,
      source: indexSource
    };
    await writeIndex(index);
  }
}

function messageResourceCacheKey(bot: BotConfig, resource: LarkMessageResource): string {
  return `lark-message-resource:${bot.id}:${resource.type}:${resource.key}`;
}

function larkFileCacheKey(bot: BotConfig, request: LarkFileCacheRequest): string {
  return [
    request.type,
    bot.id,
    request.fileToken,
    request.docType ?? "",
    request.fileExtension ?? "",
    request.freshnessKey ?? ""
  ].join(":");
}

function cacheRoot(): string {
  return path.join(stateRoot(), "file-cache");
}

function indexPath(): string {
  return path.join(cacheRoot(), "index.json");
}

async function readIndex(): Promise<Record<string, CacheIndexEntry>> {
  try {
    return JSON.parse(await readFile(indexPath(), "utf8")) as Record<string, CacheIndexEntry>;
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, CacheIndexEntry>): Promise<void> {
  await mkdir(cacheRoot(), { recursive: true });
  await writeFile(indexPath(), `${JSON.stringify(index, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
