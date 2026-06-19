import type { BotConfig, CapabilityDefinition, CustomAppSummary, McpServerConfig, SkillSummary, SuiteSummary } from "./types.js";

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
