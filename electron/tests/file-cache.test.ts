import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFileCacheIndex, type CacheIndexEntry } from "../file-cache-index.js";

test("summarizes file cache index entries for storage display", () => {
  const index: Record<string, CacheIndexEntry> = {
    "lark-drive-export:bot-1:file-1:docx:pptx:v2": {
      cacheKey: "lark-drive-export:bot-1:file-1:docx:pptx:v2",
      hash: "hash-large",
      fileName: "deck.pptx",
      bytes: 500,
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
  assert.equal(entries[0]?.freshnessKey, "v2");
  assert.equal(entries[1]?.label, "drive file / file-2");
  assert.equal(entries[2]?.label, "file / attachment.xlsx");
  assert.equal(entries[2]?.freshnessKey, undefined);
});
