import assert from "node:assert/strict";
import test from "node:test";
import { runningBotWithSameAppId } from "../bot-identity.js";
import { mergeConfig } from "../config-merge.js";
import type { AppConfig, BotConfig } from "../types.js";

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
    maxConcurrentTasks: 2,
    maxAgentTurns: 60,
    botIsolationMode: "process",
    preventSleepMode: "off"
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
  assert.deepEqual(config.bots[0]?.oauthScopes, []);
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
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });

  assert.deepEqual(config.bots[0]?.skillNames, ["approved-skill"]);
});

test("adds an empty owner to older bot configs", () => {
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
      skillNames: [],
      pendingReaction: "OnIt"
    } as never]
  });
  assert.equal(config.bots[0]?.ownerOpenId, "");
});

test("disables user-visible work progress for older bot configs", () => {
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
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    } as never]
  });
  assert.equal(config.bots[0].showProgress, false);
});

test("normalizes custom OAuth scopes on bot configs", () => {
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
      oauthScopes: ["drive:export:readonly docs:document:export", "drive:export:readonly"],
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });
  assert.deepEqual(config.bots[0].oauthScopes, ["drive:export:readonly", "docs:document:export"]);
});

test("keeps bot ids unique so listener state paths cannot collide", () => {
  const config = mergeConfig(base, {
    bots: [
      {
        id: "shared bot",
        name: "Bot 1",
        enabled: true,
        cliPath: "",
        profile: "",
        appId: "cli_1",
        appSecret: "secret",
        receiveIdentity: "bot",
        replyIdentity: "bot",
        eventTypes: ["im.message.receive_v1"],
        skillNames: [],
        pendingReaction: "OnIt",
        ownerOpenId: ""
      },
      {
        id: "shared bot",
        name: "Bot 2",
        enabled: true,
        cliPath: "",
        profile: "",
        appId: "cli_2",
        appSecret: "secret",
        receiveIdentity: "bot",
        replyIdentity: "bot",
        eventTypes: ["im.message.receive_v1"],
        skillNames: [],
        pendingReaction: "OnIt",
        ownerOpenId: ""
      }
    ]
  });

  assert.deepEqual(config.bots.map((item) => item.id), ["shared-bot", "shared-bot-2"]);
});

test("adds a bounded max agent turns runtime config", () => {
  assert.equal(mergeConfig(base, {}).runtime.maxAgentTurns, 60);
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, maxAgentTurns: 500 } }).runtime.maxAgentTurns, 100);
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, maxAgentTurns: 1 } }).runtime.maxAgentTurns, 10);
});

test("defaults bot runtime isolation to process workers", () => {
  assert.equal(mergeConfig(base, {}).runtime.botIsolationMode, "process");
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, botIsolationMode: "auto" } }).runtime.botIsolationMode, "auto");
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, botIsolationMode: "container" } }).runtime.botIsolationMode, "container");
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, botIsolationMode: "invalid" as never } }).runtime.botIsolationMode, "process");
});

test("defaults sleep prevention to off", () => {
  assert.equal(mergeConfig(base, {}).runtime.preventSleepMode, "off");
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, preventSleepMode: "when-running" } }).runtime.preventSleepMode, "when-running");
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, preventSleepMode: "when-busy" } }).runtime.preventSleepMode, "when-busy");
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, preventSleepMode: "invalid" as never } }).runtime.preventSleepMode, "off");
});

test("detects running bots that share the same Feishu app id", () => {
  const first: BotConfig = {
    id: "bot-1",
    name: "Bot 1",
    enabled: true,
    cliPath: "",
    profile: "",
    appId: "cli_same",
    appSecret: "secret",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    skillNames: [],
    pendingReaction: "OnIt",
    ownerOpenId: ""
  };
  const second: BotConfig = { ...first, id: "bot-2", name: "Bot 2", appId: " CLI_SAME " };

  assert.equal(runningBotWithSameAppId(second, [first, second], ["bot-1"]), first);
  assert.equal(runningBotWithSameAppId(second, [first, second], []), null);
});
