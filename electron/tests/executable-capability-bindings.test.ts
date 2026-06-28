import assert from "node:assert/strict";
import test from "node:test";
import { resolveExecutableCapabilityBinding } from "../executable-capability-bindings.js";
import type { BotConfig, CustomAppSummary, SkillSummary, SuiteSummary } from "../types.js";
import type { ClaudeSuiteContext } from "../claude.js";

const bot: BotConfig = {
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
  oauthScopes: [],
  skillNames: ["legacy-skill"],
  capabilityRefs: [],
  commandBindings: [],
  scheduledTasks: [],
  pendingReaction: "OnIt",
  ownerOpenId: "",
  showProgress: false
};

const skill: SkillSummary = {
  name: "legacy-skill",
  description: "Legacy skill",
  path: "/skills/legacy-skill/SKILL.md",
  knowledgePath: "/skills/legacy-skill/knowledge",
  source: "local"
};

const customApp: CustomAppSummary = {
  id: "daily-report",
  name: "Daily Report",
  description: "Create daily reports",
  version: "1.0.0",
  path: "/apps/daily-report",
  source: "local",
  entry: { type: "node", command: "node", args: ["dist/index.js"] },
  capabilities: { agentCallable: true, commandCallable: true, scheduledCallable: true, hasUi: false },
  permissions: { network: false, filesystem: ["workspace"], requiresOwnerApproval: false }
};

const suite: SuiteSummary = {
  id: "manufacturing-qa",
  name: "Manufacturing QA",
  description: "Suite for manufacturing quality tasks",
  version: "1.0.0",
  trusted: true,
  tags: ["quality"],
  path: "/suites/manufacturing-qa",
  source: "local",
  skills: ["legacy-skill"],
  apps: ["daily-report"],
  mcpServers: ["quality-db"],
  instructions: "Prefer structured QA workflows.",
  workflows: [
    { id: "root-cause-analysis", name: "Root Cause Analysis", prompt: "Analyze the defect.", steps: [] },
    {
      id: "structured-qa",
      name: "Structured QA",
      prompt: "Follow a structured QA process.",
      steps: [
        { id: "collect", name: "Collect", type: "prompt", prompt: "Collect known facts." },
        {
          id: "analyze",
          name: "Analyze",
          type: "capability",
          prompt: "Analyze with the QA skill.",
          input: "{{stepPrompt}}\n\nFacts:\n{{previous}}\n\nRequest:\n{{input}}",
          timeoutSeconds: 120,
          retry: { maxAttempts: 3 },
          capability: { kind: "skill", id: "legacy-skill" }
        }
      ]
    }
  ]
};

const suiteContext: ClaudeSuiteContext = {
  suite,
  authorizedSkills: ["legacy-skill"],
  authorizedApps: ["daily-report"],
  authorizedMcpServers: ["quality-db"]
};

test("resolves a skill capability to a claude binding", () => {
  const binding = resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "skill", id: "legacy-skill" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /qa"
  });
  assert.equal(binding.type, "claude");
  assert.equal(binding.capability.kind, "skill");
  assert.equal(binding.skills.length, 1);
  assert.equal(binding.skills[0]?.name, "legacy-skill");
});

test("resolves a suite capability to a claude binding with filtered suite context", () => {
  const binding = resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "suite", id: "manufacturing-qa" },
    trigger: "scheduled",
    botSkills: [skill],
    customApps: [customApp],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "定时任务 质量日报"
  });
  assert.equal(binding.type, "claude");
  assert.equal(binding.capability.kind, "suite");
  assert.equal(binding.suiteContexts.length, 1);
  assert.equal(binding.suiteContexts[0]?.suite.id, "manufacturing-qa");
});

test("resolves a workflow capability to a claude binding with workflow prompt", () => {
  const binding = resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "workflow", id: "manufacturing-qa/root-cause-analysis" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /rca"
  });
  assert.equal(binding.type, "claude");
  assert.equal(binding.capability.kind, "workflow");
  assert.equal(binding.workflowPrompt, "Analyze the defect.");
  assert.equal(binding.suiteContexts[0]?.suite.id, "manufacturing-qa");
});

test("resolves a workflow with declarative steps", () => {
  const binding = resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "workflow", id: "manufacturing-qa/structured-qa" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /qa"
  });
  assert.equal(binding.type, "workflow");
  assert.equal(binding.steps.length, 2);
  assert.equal(binding.steps[0]?.type, "prompt");
  assert.equal(binding.steps[1]?.type, "capability");
  assert.equal(binding.steps[1]?.input, "{{stepPrompt}}\n\nFacts:\n{{previous}}\n\nRequest:\n{{input}}");
  assert.equal(binding.steps[1]?.timeoutSeconds, 120);
  assert.deepEqual(binding.steps[1]?.retry, { maxAttempts: 3 });
});

test("resolves an app capability to a custom-app binding", () => {
  const binding = resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "app", id: "daily-report" },
    trigger: "scheduled",
    botSkills: [skill],
    customApps: [customApp],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "定时任务 日报"
  });
  assert.equal(binding.type, "custom-app");
  assert.equal(binding.customApp.id, "daily-report");
});

test("rejects custom app entry types that are not runtime-ready", () => {
  assert.throws(() => resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "app", id: "ui-app" },
    trigger: "command",
    botSkills: [skill],
    customApps: [{
      ...customApp,
      id: "ui-app",
      name: "UI App",
      entry: { type: "webview", command: "", args: [] },
      capabilities: { agentCallable: false, commandCallable: true, scheduledCallable: false, hasUi: true }
    }],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /ui"
  }), /建设中能力展示/);
});

test("resolves an mcp capability to a focused claude binding", () => {
  const binding = resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "mcp", id: "quality-db" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    mcpServers: [{
      id: "quality-db",
      name: "Quality DB",
      enabled: true,
      transport: "stdio",
      command: "node",
      args: [],
      env: []
    }],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /quality"
  });
  assert.equal(binding.type, "claude");
  assert.equal(binding.capability.kind, "mcp");
  assert.equal(binding.capability.id, "quality-db");
  assert.match(binding.workflowPrompt ?? "", /Quality DB/);
});

test("rejects non-stdio MCP capability triggers until runtime support lands", () => {
  assert.throws(() => resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "mcp", id: "remote-mcp" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    mcpServers: [{
      id: "remote-mcp",
      name: "Remote MCP",
      enabled: true,
      transport: "http",
      command: "",
      args: [],
      env: [],
      url: "https://example.com/mcp"
    }],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /remote"
  }), /尚未接入运行时/);
});

test("rejects MCP drafts without a startup command", () => {
  assert.throws(() => resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "mcp", id: "draft-mcp" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    mcpServers: [{
      id: "draft-mcp",
      name: "Draft MCP",
      enabled: true,
      transport: "stdio",
      command: "",
      args: [],
      env: []
    }],
    suites: [suite],
    suiteContexts: [suiteContext],
    errorLabel: "命令 /draft"
  }), /尚未配置启动命令/);
});

test("rejects capability triggers that policy disables", () => {
  assert.throws(() => resolveExecutableCapabilityBinding({
    bot,
    capability: { kind: "suite", id: "manufacturing-qa" },
    trigger: "command",
    botSkills: [skill],
    customApps: [customApp],
    suites: [suite],
    suiteContexts: [suiteContext],
    capabilityPolicies: new Map([["suite:manufacturing-qa", { allowCommandUse: false }]]),
    errorLabel: "命令 /qa"
  }), /未开放命令调用/);
});
