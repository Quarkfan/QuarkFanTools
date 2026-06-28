import type { FileCacheEntrySummary, LarkMessageResource } from "./types.js";

export interface CacheIndexEntry {
  cacheKey: string;
  hash: string;
  fileName: string;
  bytes: number;
  cachedAt?: string;
  botIds: string[];
  source: CacheIndexSource;
}

export type CacheIndexSource = {
  type: "lark-message-resource";
  botId: string;
  messageResourceType: LarkMessageResource["type"];
  key: string;
  name?: string;
} | {
  type: "lark-drive-file" | "lark-drive-export";
  botId: string;
  fileToken: string;
  docType?: string;
  fileExtension?: string;
  freshnessKey?: string;
};

export function summarizeFileCacheIndex(index: Record<string, CacheIndexEntry>): FileCacheEntrySummary[] {
  return Object.values(index)
    .map((entry): FileCacheEntrySummary => ({
      cacheKey: entry.cacheKey,
      sourceType: entry.source.type,
      botIds: entry.botIds,
      fileName: entry.fileName,
      bytes: entry.bytes,
      cachedAt: entry.cachedAt,
      hash: entry.hash,
      label: cacheEntryLabel(entry),
      freshnessKey: entry.source.type === "lark-message-resource" ? undefined : entry.source.freshnessKey,
      freshness: cacheEntryFreshness(entry)
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function cacheEntryFreshness(entry: CacheIndexEntry): FileCacheEntrySummary["freshness"] {
  const ageDays = entry.cachedAt && Number.isFinite(Date.parse(entry.cachedAt))
    ? Math.max(0, Math.floor((Date.now() - Date.parse(entry.cachedAt)) / (24 * 60 * 60_000)))
    : undefined;
  if (entry.source.type === "lark-message-resource") {
    return {
      status: ageDays !== undefined && ageDays > 90 ? "stale" : "fresh",
      reason: ageDays !== undefined ? `消息附件缓存 ${ageDays} 天` : "消息附件缓存无时间戳",
      ageDays
    };
  }
  if (!entry.source.freshnessKey) {
    return {
      status: "unknown",
      reason: "缺少 freshnessKey，无法确认远端文件是否变化",
      ageDays
    };
  }
  if (ageDays !== undefined && ageDays > 90) {
    return {
      status: "stale",
      reason: `缓存已超过 90 天，freshnessKey=${entry.source.freshnessKey}`,
      ageDays
    };
  }
  return {
    status: "fresh",
    reason: `freshnessKey=${entry.source.freshnessKey}`,
    ageDays
  };
}

export function removeFileCacheIndexEntry(index: Record<string, CacheIndexEntry>, cacheKey: string): { removed?: CacheIndexEntry; orphanedHash?: string } {
  const removed = index[cacheKey];
  if (!removed) return {};
  delete index[cacheKey];
  const hashStillReferenced = Object.values(index).some((entry) => entry.hash === removed.hash);
  return {
    removed,
    orphanedHash: hashStillReferenced ? undefined : removed.hash
  };
}

export function expireFileCacheIndexEntries(index: Record<string, CacheIndexEntry>, before: Date): { removed: CacheIndexEntry[]; orphanedHashes: string[] } {
  const removed: CacheIndexEntry[] = [];
  const orphanedHashes: string[] = [];
  for (const entry of Object.values(index)) {
    if (!entry.cachedAt || !Number.isFinite(Date.parse(entry.cachedAt))) continue;
    if (Date.parse(entry.cachedAt) >= before.getTime()) continue;
    const result = removeFileCacheIndexEntry(index, entry.cacheKey);
    if (result.removed) removed.push(result.removed);
    if (result.orphanedHash) orphanedHashes.push(result.orphanedHash);
  }
  return { removed, orphanedHashes };
}

function cacheEntryLabel(entry: CacheIndexEntry): string {
  if (entry.source.type === "lark-message-resource") {
    return `${entry.source.messageResourceType} / ${entry.source.name || entry.source.key}`;
  }
  if (entry.source.type === "lark-drive-export") {
    return `export / ${entry.source.docType || "doc"} -> ${entry.source.fileExtension || "file"} / ${entry.source.fileToken}`;
  }
  return `drive file / ${entry.source.fileToken}`;
}
