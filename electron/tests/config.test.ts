import assert from "node:assert/strict";
import test from "node:test";
import { mergeConfig } from "../config-merge.js";
import type { AppConfig } from "../types.js";

const base: AppConfig = {
  bots: [],
  model: {
    providerId: "anthropic",
    providerName: "Claude Compatible",
    baseUrl: "",
    model: "",
    apiKeyEnv: "ANTHROPIC_AUTH_TOKEN",
    apiKey: ""
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
  assert.deepEqual(config.bots[0]?.skillNames, ["*"]);
  assert.equal(config.bots[0]?.pendingReply, "正在查询，请稍候…");
});
