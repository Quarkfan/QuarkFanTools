import type { FileCacheEntrySummary, LarkMessageResource } from "./types.js";

export interface CacheIndexEntry {
  cacheKey: string;
  hash: string;
  fileName: string;
  bytes: number;
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
      hash: entry.hash,
      label: cacheEntryLabel(entry),
      freshnessKey: entry.source.type === "lark-message-resource" ? undefined : entry.source.freshnessKey
    }))
    .sort((a, b) => b.bytes - a.bytes);
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

function cacheEntryLabel(entry: CacheIndexEntry): string {
  if (entry.source.type === "lark-message-resource") {
    return `${entry.source.messageResourceType} / ${entry.source.name || entry.source.key}`;
  }
  if (entry.source.type === "lark-drive-export") {
    return `export / ${entry.source.docType || "doc"} -> ${entry.source.fileExtension || "file"} / ${entry.source.fileToken}`;
  }
  return `drive file / ${entry.source.fileToken}`;
}
