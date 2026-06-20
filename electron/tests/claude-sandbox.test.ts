import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSandboxFilesystem } from "../sandbox-filesystem.js";
import type { AppConfig, BotConfig, SkillSummary } from "../types.js";

const bot: BotConfig = {
  id: "default",
  name: "默认机器人",
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
};

const config: AppConfig = {
  bots: [bot, { ...bot, id: "other", name: "另一个机器人" }],
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
    maxAgentTurns: 60
  }
};

test("sandbox allows current bot state while denying other bots", () => {
  const workspace = "/app/workspace/bots/default/sessions/current";
  const botState = "/app/state/bots/default";
  const skill: SkillSummary = {
    name: "skill-a",
    description: "",
    path: "/app/workspace/skills/skill-a/SKILL.md",
    knowledgePath: null,
    source: "local"
  };
  const filesystem = buildSandboxFilesystem(config, bot, workspace, botState, [skill], {
    stateRoot: "/app/state",
    workspaceRoot: "/app/workspace",
    skillsRoot: "/app/workspace/skills"
  });

  assert.ok(filesystem.allowWrite.includes(botState));
  assert.ok(filesystem.allowRead.includes(botState));
  assert.ok(!filesystem.allowWrite.includes("/Users/test/Library/Application Support/lark-cli"));
  assert.ok(!filesystem.allowRead.includes("/Users/test/Library/Application Support/lark-cli"));
  assert.ok(!filesystem.denyWrite.includes(path.dirname(botState)));
  assert.ok(!filesystem.denyRead.includes(path.dirname(botState)));
  assert.ok(filesystem.denyWrite.some((item) => item.endsWith("/state/bots/other")));
  assert.ok(filesystem.denyRead.some((item) => item.endsWith("/state/bots/other")));
});

test("per-bot lark secure store stays inside current bot state", () => {
  const botState = "/app/state/bots/default";
  const secureStore = path.join(botState, "lark-home", "Library", "Application Support", "lark-cli");
  const otherSecureStore = "/app/state/bots/other/lark-home/Library/Application Support/lark-cli";
  const filesystem = buildSandboxFilesystem(config, bot, "/app/workspace/bots/default/sessions/current", botState, [], {
    stateRoot: "/app/state",
    workspaceRoot: "/app/workspace",
    skillsRoot: "/app/workspace/skills"
  });

  assert.ok(secureStore.startsWith(botState));
  assert.ok(filesystem.allowRead.includes(botState));
  assert.ok(filesystem.allowWrite.includes(botState));
  assert.ok(filesystem.denyRead.some((item) => otherSecureStore.startsWith(item)));
  assert.ok(filesystem.denyWrite.some((item) => otherSecureStore.startsWith(item)));
});
