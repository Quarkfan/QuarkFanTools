import assert from "node:assert/strict";
import test from "node:test";
import { platformConnectorDiagnostics } from "../platform-diagnostics.js";
import type { AppConfig } from "../types.js";

const baseConfig: AppConfig = {
  bots: [],
  mcpServers: [],
  ui: { theme: "system" },
  skillMarket: { enabled: false, repositoryUrl: "", branch: "main", token: "" },
  model: { providerId: "", providerName: "", baseUrl: "", model: "", apiKeyEnv: "", apiKey: "", multimodalEnabled: false },
  runtime: { sandbox: "workspace-write", approvalPolicy: "never", maxConcurrentTasks: 2, maxAgentTurns: 60 }
};

test("diagnoses temporarily closed wecom provider", () => {
  const diagnostics = platformConnectorDiagnostics({
    ...baseConfig,
    bots: [{
      id: "wecom-bot",
      name: "WeCom Bot",
      enabled: true,
      provider: "wecom",
      cliPath: "",
      profile: "agent-1",
      appId: "corp-id",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: [],
      providerOptions: {},
      connectors: { lark: { enabled: true, appId: "", appSecret: "", oauthScopes: [] } },
      deliveryRoutes: [{ id: "to-lark", enabled: true, provider: "lark", chatId: "", mode: "copy-final-reply" }],
      oauthScopes: [],
      skillNames: [],
      capabilityRefs: [],
      commandBindings: [],
      scheduledTasks: [],
      pendingReaction: "OnIt",
      ownerOpenId: "",
      showProgress: false
    }]
  });

  assert.equal(diagnostics[0]?.status, "error");
  assert.match(diagnostics[0]?.issues.join("\n") ?? "", /企业微信 Provider[\s\S]*暂时封闭/);
  assert.match(diagnostics[0]?.recommendations.join("\n") ?? "", /改用飞书/);
  assert.doesNotMatch(diagnostics[0]?.recommendations.join("\n") ?? "", /内置轮询桥|NDJSON/);
});

test("marks complete lark bot platform config as ok", () => {
  const diagnostics = platformConnectorDiagnostics({
    ...baseConfig,
    bots: [{
      id: "lark-bot",
      name: "Lark Bot",
      enabled: true,
      provider: "lark",
      cliPath: "",
      profile: "",
      appId: "cli_xxx",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: ["im.message.receive_v1"],
      oauthScopes: [],
      skillNames: [],
      capabilityRefs: [],
      commandBindings: [],
      scheduledTasks: [],
      pendingReaction: "OnIt",
      ownerOpenId: "",
      showProgress: false
    }]
  });

  assert.equal(diagnostics[0]?.status, "ok");
});
