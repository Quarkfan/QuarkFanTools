import type { BotConfig, CapabilityDefinition, CapabilityGovernanceDiagnostic, CustomAppSummary, McpServerConfig, SkillSummary, SuiteSummary } from "./types.js";

export function capabilityDefinitions(skills: SkillSummary[], customApps: CustomAppSummary[], suites: SuiteSummary[] = [], mcpServers: McpServerConfig[] = []): CapabilityDefinition[] {
  return [
    ...skills.map((skill): CapabilityDefinition => ({
      kind: "skill",
      id: skill.name,
      name: skill.name,
      description: skill.description,
      source: skill.source,
      enabled: true
    })),
    ...customApps.map((app): CapabilityDefinition => ({
      kind: "app",
      id: app.id,
      name: app.name,
      description: app.description,
      source: app.source,
      enabled: true,
      version: app.version,
      tags: [
        app.capabilities.agentCallable ? "agent" : "",
        app.capabilities.commandCallable ? "command" : "",
        app.capabilities.scheduledCallable ? "scheduled" : "",
        app.capabilities.hasUi ? "ui" : ""
      ].filter(Boolean)
    })),
    ...suites.map((suite): CapabilityDefinition => ({
      kind: "suite",
      id: suite.id,
      name: suite.name,
      description: suite.description,
      source: suite.source,
      enabled: true,
      tags: [
        suite.skills.length ? `${suite.skills.length}-skills` : "",
        suite.apps.length ? `${suite.apps.length}-apps` : "",
        suite.mcpServers.length ? `${suite.mcpServers.length}-mcps` : "",
        suite.workflows.length ? `${suite.workflows.length}-workflows` : ""
      ].filter(Boolean)
    })),
    ...suites.flatMap((suite) => suite.workflows.map((workflow): CapabilityDefinition => ({
      kind: "workflow",
      id: `${suite.id}/${workflow.id}`,
      name: `${suite.name} / ${workflow.name}`,
      description: workflow.prompt,
      source: suite.source,
      enabled: true,
      tags: [
        `suite:${suite.id}`
      ]
    }))),
    ...mcpServers.map((server): CapabilityDefinition => ({
      kind: "mcp",
      id: server.id,
      name: server.name,
      description: server.description || `${server.command} ${server.args.join(" ")}`.trim(),
      source: "config",
      enabled: server.enabled,
      tags: [
        server.transport,
        server.alwaysLoad ? "always-load" : "",
        server.timeoutMs ? `${server.timeoutMs}ms` : ""
      ].filter(Boolean)
    }))
  ];
}

export function botCapabilityRefs(bot: BotConfig) {
  const refs = [...(bot.capabilityRefs ?? [])];
  const existing = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
  for (const skillName of bot.skillNames) {
    const key = `skill:${skillName}`;
    if (existing.has(key)) continue;
    refs.push({
      kind: "skill",
      id: skillName,
      enabled: true,
      policy: {
        allowAgentUse: true,
        allowCommandUse: true,
        allowScheduledUse: true
      }
    });
  }
  return refs;
}

export function resolveBotCapabilities(bot: BotConfig, definitions: CapabilityDefinition[]): CapabilityDefinition[] {
  const byKey = new Map(definitions.map((definition) => [`${definition.kind}:${definition.id}`, definition]));
  const refs = botCapabilityRefs(bot);
  const suiteIds = new Set(refs.filter((ref) => ref.enabled && ref.kind === "suite").map((ref) => ref.id));
  const resolved = refs
    .filter((ref) => ref.enabled)
    .map((ref) => byKey.get(`${ref.kind}:${ref.id}`))
    .filter((definition): definition is CapabilityDefinition => Boolean(definition?.enabled));
  const workflowDefinitions = definitions.filter((definition) =>
    definition.kind === "workflow" &&
    definition.enabled &&
    definition.tags?.some((tag) => tag.startsWith("suite:") && suiteIds.has(tag.slice("suite:".length)))
  );
  const seen = new Set(resolved.map((definition) => `${definition.kind}:${definition.id}`));
  for (const definition of workflowDefinitions) {
    const key = `${definition.kind}:${definition.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(definition);
  }
  return resolved;
}

export function capabilityGovernanceDiagnostics(skills: SkillSummary[], customApps: CustomAppSummary[], suites: SuiteSummary[] = [], mcpServers: McpServerConfig[] = []): CapabilityGovernanceDiagnostic[] {
  const skillIds = new Set(skills.map((skill) => skill.name));
  const appIds = new Set(customApps.map((app) => app.id));
  const suiteIds = new Set(suites.map((suite) => suite.id));
  const mcpIds = new Set(mcpServers.map((server) => server.id));
  return [
    ...customApps.map((app) => appGovernanceDiagnostic(app)),
    ...suites.flatMap((suite) => suiteGovernanceDiagnostics(suite, { skillIds, appIds, suiteIds, mcpIds }))
  ].sort((a, b) => severityRank(b.status) - severityRank(a.status) || riskRank(b.risk) - riskRank(a.risk) || a.name.localeCompare(b.name));
}

function appGovernanceDiagnostic(app: CustomAppSummary): CapabilityGovernanceDiagnostic {
  const issues: string[] = [];
  const recommendations: string[] = [];
  if (app.entry.type === "executable") {
    issues.push("使用 executable 入口，运行风险高于 node 入口");
    recommendations.push("仅授权给可信 Bot，并优先要求 Owner 审批");
  }
  if (app.entry.type === "webview") {
    issues.push("声明 webview/ui 入口，当前尚未接入完整 UI 生命周期");
    recommendations.push("当前只作为建设中能力展示，不会出现在命令或定时任务可执行目标中");
  }
  if (app.entry.type === "mcp-adapter") {
    issues.push("声明 mcp-adapter 入口，当前尚未接入完整 MCP 包装生命周期");
    recommendations.push("先使用全局 MCP 配置接入该服务");
  }
  if (app.entry.type === "workflow") {
    issues.push("声明 workflow 入口，当前请使用套件 Workflow 执行");
    recommendations.push("当前只作为元数据展示，不会出现在命令或定时任务可执行目标中");
  }
  if (app.permissions.network) {
    issues.push("请求网络访问权限");
    recommendations.push("确认网络目标和数据边界后再授权");
  }
  const broadFilesystem = app.permissions.filesystem.filter((item) => !["workspace", "session", "bot-state"].includes(item));
  if (broadFilesystem.length > 0) {
    issues.push(`请求额外文件系统权限: ${broadFilesystem.join(", ")}`);
    recommendations.push("优先限制到当前会话 workspace 或当前 Bot 状态目录");
  }
  if (app.permissions.requiresOwnerApproval) {
    recommendations.push("该应用要求 Owner 审批，Bot policy 应保持 requireOwnerApproval");
  }
  if (!app.capabilities.agentCallable && !app.capabilities.commandCallable && !app.capabilities.scheduledCallable && !app.capabilities.hasUi) {
    issues.push("未声明任何可调用能力");
    recommendations.push("补充 capabilities 声明，否则授权后也无法被有效调用");
  }
  const risk = app.entry.type === "executable" || app.permissions.network || broadFilesystem.length > 0
    ? "high"
    : app.permissions.requiresOwnerApproval || app.entry.type === "webview" || app.entry.type === "mcp-adapter"
      ? "medium"
      : "low";
  return {
    kind: "app",
    id: app.id,
    name: app.name,
    status: issues.length > 0 ? "warn" : "ok",
    risk,
    issues,
    recommendations
  };
}

function suiteGovernanceDiagnostics(suite: SuiteSummary, known: { skillIds: Set<string>; appIds: Set<string>; suiteIds: Set<string>; mcpIds: Set<string> }): CapabilityGovernanceDiagnostic[] {
  const issues: string[] = [];
  for (const skill of suite.skills) if (!known.skillIds.has(skill)) issues.push(`缺失 Skill: ${skill}`);
  for (const app of suite.apps) if (!known.appIds.has(app)) issues.push(`缺失自定义应用: ${app}`);
  for (const mcp of suite.mcpServers) if (!known.mcpIds.has(mcp)) issues.push(`缺失 MCP: ${mcp}`);
  if (suite.skills.length === 0 && suite.apps.length === 0 && suite.mcpServers.length === 0 && suite.workflows.length === 0 && !suite.instructions) {
    issues.push("套件没有声明任何子能力、Workflow 或 instructions");
  }
  const diagnostics: CapabilityGovernanceDiagnostic[] = [{
    kind: "suite",
    id: suite.id,
    name: suite.name,
    status: issues.length > 0 ? "error" : "ok",
    risk: issues.length > 0 ? "medium" : "low",
    issues,
    recommendations: issues.length > 0 ? ["补齐缺失依赖后再授权给 Bot", "套件不会自动授予底层子能力，仍需逐项授权"] : ["套件依赖完整，授权时仍需确认底层子能力 policy"]
  }];
  for (const workflow of suite.workflows) {
    const workflowIssues: string[] = [];
    for (const step of workflow.steps) {
      if (!step.capability) continue;
      if (step.capability.kind === "skill" && !known.skillIds.has(step.capability.id)) workflowIssues.push(`步骤 ${step.id} 缺失 Skill: ${step.capability.id}`);
      if (step.capability.kind === "app" && !known.appIds.has(step.capability.id)) workflowIssues.push(`步骤 ${step.id} 缺失自定义应用: ${step.capability.id}`);
      if (step.capability.kind === "suite" && !known.suiteIds.has(step.capability.id)) workflowIssues.push(`步骤 ${step.id} 缺失套件: ${step.capability.id}`);
    }
    diagnostics.push({
      kind: "workflow",
      id: `${suite.id}/${workflow.id}`,
      name: `${suite.name} / ${workflow.name}`,
      status: workflowIssues.length > 0 ? "error" : "ok",
      risk: workflow.steps.length > 0 ? "medium" : "low",
      issues: workflowIssues,
      recommendations: workflowIssues.length > 0 ? ["补齐 Workflow 步骤依赖后再作为命令或定时任务目标"] : ["Workflow 步骤依赖完整"]
    });
  }
  return diagnostics;
}

function severityRank(status: CapabilityGovernanceDiagnostic["status"]): number {
  return status === "error" ? 3 : status === "warn" ? 2 : 1;
}

function riskRank(risk: CapabilityGovernanceDiagnostic["risk"]): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}
