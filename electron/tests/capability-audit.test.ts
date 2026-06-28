import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendCapabilityAudit, capabilityAuditReport } from "../capability-audit.js";
import type { AppConfig } from "../types.js";

test("summarizes capability audit records by bot capability and trigger", async () => {
  await withTempCwd(async () => {
    await appendCapabilityAudit({
      at: "2026-06-22T01:00:00.000Z",
      botId: "bot-1",
      trigger: "command",
      source: "命令 /qa",
      capability: { kind: "skill", id: "qa", name: "QA" },
      status: "success",
      durationMs: 120
    });
    await appendCapabilityAudit({
      at: "2026-06-22T01:05:00.000Z",
      botId: "bot-1",
      trigger: "command",
      source: "命令 /qa",
      capability: { kind: "skill", id: "qa", name: "QA" },
      status: "approval-required",
      detail: "Bot capability policy 要求审批"
    });
    const report = await capabilityAuditReport(testConfig(), 10);
    assert.equal(report.recent.length, 2);
    assert.equal(report.recent[0]?.status, "approval-required");
    assert.equal(report.summaries.length, 1);
    assert.equal(report.summaries[0]?.total, 2);
    assert.equal(report.summaries[0]?.success, 1);
    assert.equal(report.summaries[0]?.approvalRequired, 1);
    assert.equal(report.summaries[0]?.botName, "Bot 1");
  });
});

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const previous = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-capability-audit-"));
  try {
    process.chdir(root);
    await run();
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
}

function testConfig(): AppConfig {
  return {
    bots: [{
      id: "bot-1",
      name: "Bot 1",
      enabled: true,
      cliPath: "",
      profile: "",
      appId: "cli_test",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: [],
      skillNames: [],
      capabilityRefs: [],
      commandBindings: [],
      scheduledTasks: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }],
    mcpServers: [],
    ui: { theme: "system" },
    skillMarket: { enabled: false, repositoryUrl: "", branch: "main", token: "" },
    model: { providerId: "anthropic", providerName: "Anthropic", baseUrl: "", model: "", apiKeyEnv: "ANTHROPIC_API_KEY", apiKey: "", multimodalEnabled: true },
    runtime: { sandbox: "workspace-write", approvalPolicy: "on-request", maxConcurrentTasks: 2, maxAgentTurns: 60 }
  };
}
