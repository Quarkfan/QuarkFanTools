import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNodeArgs } from "../custom-app-entry.js";
import type { CustomAppSummary } from "../types.js";

test("normalizes node custom app script args relative to app path", () => {
  const customApp: CustomAppSummary = {
    id: "daily-report",
    name: "日报",
    description: "生成日报",
    version: "1.0.0",
    path: "/tmp/daily-report",
    source: "local",
    entry: {
      type: "node",
      command: "node",
      args: ["dist/index.js", "--mode", "summary"]
    },
    capabilities: {
      agentCallable: false,
      commandCallable: true,
      scheduledCallable: false,
      hasUi: false
    },
    permissions: {
      network: false,
      filesystem: [],
      requiresOwnerApproval: false
    }
  };
  assert.deepEqual(normalizeNodeArgs(customApp), [
    "/tmp/daily-report/dist/index.js",
    "--mode",
    "summary"
  ]);
});
