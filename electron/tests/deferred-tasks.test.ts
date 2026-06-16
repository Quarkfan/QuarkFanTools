import assert from "node:assert/strict";
import test from "node:test";
import { continueTaskId, parseDeferredTask } from "../deferred-task-protocol.js";

test("parses a deferred download request", () => {
  assert.deepEqual(parseDeferredTask('DEFERRED_DOWNLOAD: {"summary":"已找到文件","followUpPrompt":"继续下载并分析"}'), {
    summary: "已找到文件",
    followUpPrompt: "继续下载并分析"
  });
});

test("rejects incomplete deferred download requests", () => {
  assert.equal(parseDeferredTask('DEFERRED_DOWNLOAD: {"summary":"缺少后续任务"}'), null);
});

test("parses continue task commands", () => {
  assert.equal(continueTaskId("/continue a1b2-c3"), "a1b2-c3");
  assert.equal(continueTaskId("继续"), null);
});
