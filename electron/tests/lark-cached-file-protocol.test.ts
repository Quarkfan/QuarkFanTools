import assert from "node:assert/strict";
import test from "node:test";
import { parseLarkCachedFileRequest } from "../lark-cached-file-protocol.js";

test("parses cached drive export requests", () => {
  assert.deepEqual(parseLarkCachedFileRequest('LARK_CACHED_FILE: {"action":"drive-export","fileToken":"tok","docType":"slides","fileExtension":"pptx","fileName":"deck.pptx","freshnessKey":"v1","prompt":"分析这个 PPT"}'), {
    action: "drive-export",
    fileToken: "tok",
    docType: "slides",
    fileExtension: "pptx",
    fileName: "deck.pptx",
    freshnessKey: "v1",
    prompt: "分析这个 PPT"
  });
});

test("parses cached drive download requests", () => {
  assert.deepEqual(parseLarkCachedFileRequest('LARK_CACHED_FILE: {"action":"drive-download","fileToken":"file-token","prompt":"读取文件"}'), {
    action: "drive-download",
    fileToken: "file-token",
    fileName: undefined,
    docType: undefined,
    fileExtension: undefined,
    freshnessKey: undefined,
    prompt: "读取文件"
  });
});

test("rejects incomplete cached export requests", () => {
  assert.equal(parseLarkCachedFileRequest('LARK_CACHED_FILE: {"action":"drive-export","fileToken":"tok","prompt":"分析"}'), null);
  assert.equal(parseLarkCachedFileRequest('hello'), null);
});
