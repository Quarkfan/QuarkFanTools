import assert from "node:assert/strict";
import test from "node:test";
import { mergeConfig } from "../config-merge.js";
import type { AppConfig } from "../types.js";

const base: AppConfig = {
  bots: [],
  skillMarket: {
    enabled: false,
    repositoryUrl: "",
    branch: "main",
    token: ""
  },
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
    maxConcurrentTasks: 2
  }
};

test("migrates a legacy single bot config", () => {
  const config = mergeConfig(base, {
    lark: {
      cliPath: "",
      profile: "",
      appId: "cli_test",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: ["im.message.receive_v1"]
    }
  });

  assert.equal(config.bots.length, 1);
  assert.equal(config.bots[0]?.appId, "cli_test");
  assert.deepEqual(config.bots[0]?.skillNames, []);
  assert.equal(config.bots[0]?.pendingReaction, "OnIt");
  assert.equal(config.model.multimodalEnabled, true);
});

test("removes wildcard skill access so new skills require explicit authorization", () => {
  const config = mergeConfig(base, {
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
      eventTypes: ["im.message.receive_v1"],
      skillNames: ["*", "approved-skill"],
      pendingReaction: "OnIt"
    }]
  });

  assert.deepEqual(config.bots[0]?.skillNames, ["approved-skill"]);
});
