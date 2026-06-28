import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { repairFileCacheIndex } from "../file-cache.js";
import { expireFileCacheIndexEntries, removeFileCacheIndexEntry, summarizeFileCacheIndex, type CacheIndexEntry } from "../file-cache-index.js";

test("summarizes file cache index entries for storage display", () => {
  const index: Record<string, CacheIndexEntry> = {
    "lark-drive-export:bot-1:file-1:docx:pptx:v2": {
      cacheKey: "lark-drive-export:bot-1:file-1:docx:pptx:v2",
      hash: "hash-large",
      fileName: "deck.pptx",
      bytes: 500,
      cachedAt: "2026-06-01T00:00:00.000Z",
      botIds: ["bot-1", "bot-2"],
      source: {
        type: "lark-drive-export",
        botId: "bot-1",
        fileToken: "file-1",
        docType: "docx",
        fileExtension: "pptx",
        freshnessKey: "v2"
      }
    },
    "lark-message-resource:bot-1:file:message-file": {
      cacheKey: "lark-message-resource:bot-1:file:message-file",
      hash: "hash-small",
      fileName: "attachment.xlsx",
      bytes: 20,
      botIds: ["bot-1"],
      source: {
        type: "lark-message-resource",
        botId: "bot-1",
        messageResourceType: "file",
        key: "message-file",
        name: "attachment.xlsx"
      }
    },
    "lark-drive-file:bot-3:file-2:::etag-1": {
      cacheKey: "lark-drive-file:bot-3:file-2:::etag-1",
      hash: "hash-medium",
      fileName: "manual.pdf",
      bytes: 120,
      botIds: ["bot-3"],
      source: {
        type: "lark-drive-file",
        botId: "bot-3",
        fileToken: "file-2",
        freshnessKey: "etag-1"
      }
    }
  };

  const entries = summarizeFileCacheIndex(index);

  assert.deepEqual(entries.map((entry) => entry.fileName), ["deck.pptx", "manual.pdf", "attachment.xlsx"]);
  assert.deepEqual(entries.map((entry) => entry.sourceType), ["lark-drive-export", "lark-drive-file", "lark-message-resource"]);
  assert.equal(entries[0]?.label, "export / docx -> pptx / file-1");
  assert.equal(entries[0]?.cachedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(entries[0]?.freshnessKey, "v2");
  assert.equal(entries[0]?.freshness.status, "fresh");
  assert.equal(entries[1]?.label, "drive file / file-2");
  assert.equal(entries[1]?.freshness.reason, "freshnessKey=etag-1");
  assert.equal(entries[2]?.label, "file / attachment.xlsx");
  assert.equal(entries[2]?.freshnessKey, undefined);
});

test("marks drive cache freshness unknown when remote freshness key is missing", () => {
  const entries = summarizeFileCacheIndex({
    "lark-drive-file:bot-1:file-1:::": {
      cacheKey: "lark-drive-file:bot-1:file-1:::",
      hash: "hash",
      fileName: "manual.pdf",
      bytes: 20,
      cachedAt: new Date().toISOString(),
      botIds: ["bot-1"],
      source: { type: "lark-drive-file", botId: "bot-1", fileToken: "file-1" }
    }
  });
  assert.equal(entries[0]?.freshness.status, "unknown");
  assert.match(entries[0]?.freshness.reason ?? "", /freshnessKey/);
});

test("expires stale file cache index entries without deleting shared content early", () => {
  const index: Record<string, CacheIndexEntry> = {
    "lark-drive-file:bot-1:file-1:::old": {
      cacheKey: "lark-drive-file:bot-1:file-1:::old",
      hash: "shared-hash",
      fileName: "manual.pdf",
      bytes: 120,
      cachedAt: "2026-01-01T00:00:00.000Z",
      botIds: ["bot-1"],
      source: { type: "lark-drive-file", botId: "bot-1", fileToken: "file-1", freshnessKey: "old" }
    },
    "lark-drive-export:bot-2:file-2:docx:pptx:new": {
      cacheKey: "lark-drive-export:bot-2:file-2:docx:pptx:new",
      hash: "shared-hash",
      fileName: "manual.pdf",
      bytes: 120,
      cachedAt: "2026-06-01T00:00:00.000Z",
      botIds: ["bot-2"],
      source: { type: "lark-drive-export", botId: "bot-2", fileToken: "file-2", docType: "docx", fileExtension: "pptx", freshnessKey: "new" }
    },
    "lark-message-resource:bot-3:file:legacy": {
      cacheKey: "lark-message-resource:bot-3:file:legacy",
      hash: "legacy-hash",
      fileName: "legacy.xlsx",
      bytes: 80,
      botIds: ["bot-3"],
      source: { type: "lark-message-resource", botId: "bot-3", messageResourceType: "file", key: "legacy", name: "legacy.xlsx" }
    }
  };

  const result = expireFileCacheIndexEntries(index, new Date("2026-03-01T00:00:00.000Z"));

  assert.deepEqual(result.removed.map((entry) => entry.cacheKey), ["lark-drive-file:bot-1:file-1:::old"]);
  assert.deepEqual(result.orphanedHashes, []);
  assert.deepEqual(Object.keys(index), [
    "lark-drive-export:bot-2:file-2:docx:pptx:new",
    "lark-message-resource:bot-3:file:legacy"
  ]);
});

test("removes file cache index entries without orphaning shared hashes", () => {
  const index: Record<string, CacheIndexEntry> = {
    "lark-drive-file:bot-1:file-1:::etag-1": {
      cacheKey: "lark-drive-file:bot-1:file-1:::etag-1",
      hash: "shared-hash",
      fileName: "manual.pdf",
      bytes: 120,
      botIds: ["bot-1"],
      source: { type: "lark-drive-file", botId: "bot-1", fileToken: "file-1", freshnessKey: "etag-1" }
    },
    "lark-drive-export:bot-2:file-2:docx:pptx:v1": {
      cacheKey: "lark-drive-export:bot-2:file-2:docx:pptx:v1",
      hash: "shared-hash",
      fileName: "manual.pdf",
      bytes: 120,
      botIds: ["bot-2"],
      source: { type: "lark-drive-export", botId: "bot-2", fileToken: "file-2", docType: "docx", fileExtension: "pptx", freshnessKey: "v1" }
    }
  };

  const first = removeFileCacheIndexEntry(index, "lark-drive-file:bot-1:file-1:::etag-1");
  assert.equal(first.removed?.cacheKey, "lark-drive-file:bot-1:file-1:::etag-1");
  assert.equal(first.orphanedHash, undefined);
  assert.deepEqual(Object.keys(index), ["lark-drive-export:bot-2:file-2:docx:pptx:v1"]);

  const second = removeFileCacheIndexEntry(index, "lark-drive-export:bot-2:file-2:docx:pptx:v1");
  assert.equal(second.orphanedHash, "shared-hash");
  assert.deepEqual(index, {});

  assert.deepEqual(removeFileCacheIndexEntry(index, "missing"), {});
});

test("repairs file cache index and removes orphaned content", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-cache-test-"));
  process.chdir(root);
  try {
    await mkdir(path.join(root, "state", "file-cache", "live-hash"), { recursive: true });
    await mkdir(path.join(root, "state", "file-cache", "missing-hash"), { recursive: true });
    await mkdir(path.join(root, "state", "file-cache", "orphan-hash"), { recursive: true });
    await writeFile(path.join(root, "state", "file-cache", "live-hash", "live.txt"), "ok");
    await writeFile(path.join(root, "state", "file-cache", "index.json"), `${JSON.stringify({
      live: {
        cacheKey: "live",
        hash: "live-hash",
        fileName: "live.txt",
        bytes: 2,
        botIds: ["bot-1"],
        source: { type: "lark-drive-file", botId: "bot-1", fileToken: "file-1" }
      },
      missing: {
        cacheKey: "missing",
        hash: "missing-hash",
        fileName: "missing.txt",
        bytes: 2,
        botIds: ["bot-1"],
        source: { type: "lark-drive-file", botId: "bot-1", fileToken: "file-2" }
      }
    })}\n`);

    const report = await repairFileCacheIndex();

    assert.equal(report.removedEntries, 1);
    assert.equal(report.removedHashes, 2);
    assert.equal(report.repairedEntries, 1);
  } finally {
    process.chdir(previousCwd);
  }
});
