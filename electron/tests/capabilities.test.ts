import assert from "node:assert/strict";
import test from "node:test";
import { botCapabilityRefs, capabilityDefinitions, capabilityGovernanceDiagnostics, resolveBotCapabilities } from "../capabilities.js";
import type { BotConfig, CustomAppSummary, McpServerConfig, SkillSummary, SuiteSummary } from "../types.js";

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
  capabilityRefs: [{ kind: "app", id: "daily-report", enabled: true }, { kind: "suite", id: "manufacturing-qa", enabled: true }, { kind: "mcp", id: "quality-db", enabled: true }],
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
  workflows: [{ id: "root-cause-analysis", name: "Root Cause Analysis", prompt: "Analyze the defect.", steps: [] }]
};

const mcpServer: McpServerConfig = {
  id: "quality-db",
  name: "Quality DB",
  enabled: true,
  transport: "stdio",
  command: "node",
  args: ["dist/mcp.js"],
  env: [],
  description: "Quality database MCP"
};

test("builds capability definitions for skills, custom apps, and suites", () => {
  const definitions = capabilityDefinitions([skill], [customApp], [suite], [mcpServer]);
  assert.deepEqual(definitions.map((definition) => `${definition.kind}:${definition.id}`), [
    "skill:legacy-skill",
    "app:daily-report",
    "suite:manufacturing-qa",
    "workflow:manufacturing-qa/root-cause-analysis",
    "mcp:quality-db"
  ]);
});

test("resolves legacy skill names and explicit capability refs for a bot", () => {
  const definitions = capabilityDefinitions([skill], [customApp], [suite], [mcpServer]);
  assert.deepEqual(botCapabilityRefs(bot).map((ref) => `${ref.kind}:${ref.id}`), [
    "app:daily-report",
    "suite:manufacturing-qa",
    "mcp:quality-db",
    "skill:legacy-skill"
  ]);
  assert.deepEqual(resolveBotCapabilities(bot, definitions).map((definition) => `${definition.kind}:${definition.id}`), [
    "app:daily-report",
    "suite:manufacturing-qa",
    "mcp:quality-db",
    "skill:legacy-skill",
    "workflow:manufacturing-qa/root-cause-analysis"
  ]);
});

test("diagnoses extensibility risks and missing suite dependencies", () => {
  const riskyApp: CustomAppSummary = {
    ...customApp,
    id: "shell-runner",
    name: "Shell Runner",
    entry: { type: "executable", command: "./runner", args: [] },
    permissions: { network: true, filesystem: ["workspace", "/tmp"], requiresOwnerApproval: true }
  };
  const desktopApp: CustomAppSummary = {
    ...customApp,
    id: "wechat-draft",
    name: "WeChat Draft",
    permissions: {
      network: false,
      filesystem: ["workspace"],
      requiresOwnerApproval: true,
      desktopAutomation: {
        screenCapture: true,
        accessibility: true,
        clipboard: true,
        keyboardInput: true,
        autoSend: false
      }
    }
  };
  const brokenSuite: SuiteSummary = {
    ...suite,
    id: "broken-suite",
    name: "Broken Suite",
    skills: ["legacy-skill", "missing-skill"],
    apps: ["missing-app"],
    mcpServers: ["missing-mcp"],
    workflows: [{
      id: "broken-flow",
      name: "Broken Flow",
      prompt: "Run missing dependency.",
      steps: [{
        id: "missing-step",
        name: "Missing Step",
        type: "capability",
        prompt: "Use missing app.",
        capability: { kind: "app", id: "missing-app" }
      }]
    }]
  };

  const diagnostics = capabilityGovernanceDiagnostics([skill], [customApp, riskyApp, desktopApp], [suite, brokenSuite], [mcpServer]);
  const risky = diagnostics.find((item) => item.kind === "app" && item.id === "shell-runner");
  assert.equal(risky?.status, "warn");
  assert.equal(risky?.risk, "high");
  assert.match(risky?.issues.join("\n") ?? "", /executable[\s\S]*网络[\s\S]*文件系统/);

  const desktop = diagnostics.find((item) => item.kind === "app" && item.id === "wechat-draft");
  assert.equal(desktop?.status, "warn");
  assert.equal(desktop?.risk, "high");
  assert.match(desktop?.issues.join("\n") ?? "", /桌面自动化/);

  const suiteDiagnostic = diagnostics.find((item) => item.kind === "suite" && item.id === "broken-suite");
  assert.equal(suiteDiagnostic?.status, "error");
  assert.match(suiteDiagnostic?.issues.join("\n") ?? "", /missing-skill[\s\S]*missing-app[\s\S]*missing-mcp/);

  const workflowDiagnostic = diagnostics.find((item) => item.kind === "workflow" && item.id === "broken-suite/broken-flow");
  assert.equal(workflowDiagnostic?.status, "error");
  assert.match(workflowDiagnostic?.issues.join("\n") ?? "", /missing-step[\s\S]*missing-app/);
});
