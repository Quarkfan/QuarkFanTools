import assert from "node:assert/strict";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { workspaceSessionId } from "../conversation.js";
import { clearExpiredCustomAppArtifactStorage, clearMessageCursorStorage, storageStats } from "../storage.js";
import type { AppConfig } from "../types.js";

test("storage tracks and clears expired custom app artifacts", async () => {
  const botId = `storage-artifact-${Date.now()}`;
  const conversationKey = "chat:user";
  const appId = "template.wechat-draft-assistant";
  const root = path.resolve("bots", botId, "sessions", workspaceSessionId(conversationKey), "apps", appId);
  const stateRoot = path.resolve("state", "bots", botId);
  await mkdir(root, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await writeFile(path.join(stateRoot, "sessions.json"), `${JSON.stringify({
    [conversationKey]: {
      sessionId: "claude-session",
      updatedAt: new Date().toISOString(),
      messageIds: []
    }
  }, null, 2)}\n`);
  const imagePath = path.join(root, "wechat-list.png");
  await writeFile(imagePath, "screenshot");
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await utimes(imagePath, old, old);
  await utimes(root, old, old);
  const config = testConfig(1);
  let stats = await storageStats(config);
  const artifact = stats.customAppArtifacts.find((item) => item.botId === botId && item.appId === appId);
  assert.ok(artifact);
  assert.equal(artifact.fileCount, 1);
  await clearExpiredCustomAppArtifactStorage(testConfig(1));
  stats = await storageStats(config);
  assert.equal(stats.customAppArtifacts.some((item) => item.botId === botId && item.appId === appId), false);
  await rm(path.resolve("bots", botId), { recursive: true, force: true });
  await rm(path.resolve("state", "bots", botId), { recursive: true, force: true });
});

test("storage tracks and clears message backfill cursors", async () => {
  const botId = `storage-cursor-${Date.now()}`;
  const stateRoot = path.resolve("state", "bots", botId);
  await mkdir(stateRoot, { recursive: true });
  await writeFile(path.join(stateRoot, "message-cursors.json"), JSON.stringify({
    oc_1: {
      chatId: "oc_1",
      chatType: "group",
      lastSeenAt: new Date().toISOString(),
      lastMessageId: "om_1"
    }
  }));
  let stats = await storageStats(testConfig(7));
  assert.ok(stats.messageCursorBytes > 0);
  await clearMessageCursorStorage();
  stats = await storageStats(testConfig(7));
  assert.equal(stats.messageCursorBytes, 0);
  await rm(path.resolve("state", "bots", botId), { recursive: true, force: true });
});

function testConfig(retentionDays: number): AppConfig {
  return {
    bots: [],
    mcpServers: [],
    ui: { theme: "system" },
    skillMarket: { enabled: false, repositoryUrl: "", branch: "main", token: "" },
    model: {
      providerId: "anthropic",
      providerName: "Claude Compatible",
      baseUrl: "",
      model: "",
      apiKeyEnv: "ANTHROPIC_AUTH_TOKEN",
      apiKey: "",
      multimodalEnabled: true
    },
    runtime: {
      sandbox: "workspace-write",
      approvalPolicy: "never",
      maxConcurrentTasks: 2,
      maxAgentTurns: 60,
      customAppArtifacts: { autoCleanup: false, retentionDays },
      customAppReplyProcessing: { mode: "raw", prompt: "", maxInputChars: 12000 }
    }
  };
}
