import type { AppConfig, BotConfig } from "./types.js";
import { isValidCronExpression } from "./scheduled-task-core.js";

export type LegacyConfig = Partial<AppConfig> & {
  lark?: Partial<Omit<BotConfig, "id" | "name" | "enabled" | "skillNames" | "pendingReaction" | "ownerOpenId">>;
};

export function mergeConfig(base: AppConfig, override: LegacyConfig): AppConfig {
  const legacyBot = override.lark?.appId
    ? [{
        id: "default",
        name: "默认机器人",
        enabled: true,
        provider: "lark",
        cliPath: override.lark.cliPath ?? "",
        profile: override.lark.profile ?? "",
        appId: override.lark.appId,
        appSecret: override.lark.appSecret ?? "",
        receiveIdentity: override.lark.receiveIdentity ?? "bot",
        replyIdentity: override.lark.replyIdentity ?? "bot",
        eventTypes: override.lark.eventTypes ?? ["im.message.receive_v1"],
        providerOptions: {},
        connectors: {},
        deliveryRoutes: [],
        oauthScopes: [],
        skillNames: [],
        capabilityRefs: [],
        commandBindings: [],
        scheduledTasks: [],
        pendingReaction: "OnIt",
        ownerOpenId: "",
        showProgress: false,
        longTaskNoticeSeconds: 0,
        longTaskNoticeText: defaultLongTaskNoticeText()
      } satisfies BotConfig]
    : [];
  const bots = (override.bots ?? legacyBot).map((bot) => ({
    ...bot,
    skillNames: (bot.skillNames ?? []).filter((name) => name !== "*"),
    provider: normalizeProvider(bot.provider),
    providerOptions: normalizeProviderOptions(bot.providerOptions),
    eventTypes: normalizeEventTypes(bot.provider, bot.eventTypes),
    connectors: normalizeConnectors(bot.connectors),
    deliveryRoutes: normalizeDeliveryRoutes(bot.deliveryRoutes),
    capabilityRefs: normalizeCapabilityRefs(bot.capabilityRefs),
    commandBindings: normalizeCommandBindings(bot.commandBindings),
    scheduledTasks: normalizeScheduledTasks(bot.scheduledTasks, bot.id),
    oauthScopes: normalizeScopes(bot.oauthScopes),
    pendingReaction: bot.pendingReaction || "OnIt",
    ownerOpenId: bot.ownerOpenId || "",
    showProgress: bot.showProgress ?? false,
    longTaskNoticeSeconds: normalizeLongTaskNoticeSeconds(bot.longTaskNoticeSeconds),
    longTaskNoticeText: bot.longTaskNoticeText?.trim() || defaultLongTaskNoticeText()
  }));
  return {
    ...base,
    ...override,
    bots,
    mcpServers: normalizeMcpServers(override.mcpServers ?? base.mcpServers),
    ui: {
      ...base.ui,
      ...override.ui,
      theme: ["system", "light", "dark"].includes(String(override.ui?.theme ?? base.ui.theme))
        ? (override.ui?.theme ?? base.ui.theme)
        : base.ui.theme
    },
    skillMarket: { ...base.skillMarket, ...override.skillMarket },
    model: { ...base.model, ...override.model },
    runtime: {
      ...base.runtime,
      ...override.runtime,
      maxAgentTurns: Math.max(10, Math.min(100, override.runtime?.maxAgentTurns ?? base.runtime.maxAgentTurns ?? 60))
    }
  };
}

function defaultLongTaskNoticeText(): string {
  return "这个问题还在处理中，我会继续完成并在结果出来后回复。";
}

function normalizeLongTaskNoticeSeconds(value: unknown): number {
  const seconds = Math.floor(Number(value ?? 0));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(5, Math.min(3600, seconds));
}

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return [];
  return [...new Set(scopes
    .flatMap((scope) => String(scope).split(/[\s,]+/))
    .map((scope) => scope.trim())
    .filter(Boolean))];
}

function normalizeProvider(provider: unknown): BotConfig["provider"] {
  return ["lark", "wecom", "dingtalk"].includes(String(provider ?? "lark"))
    ? String(provider ?? "lark") as BotConfig["provider"]
    : "lark";
}

function normalizeEventTypes(provider: unknown, eventTypes: unknown): string[] {
  if (Array.isArray(eventTypes) && eventTypes.some(Boolean)) return eventTypes.map(String).filter(Boolean);
  return normalizeProvider(provider) === "wecom" ? ["message.receive"] : ["im.message.receive_v1"];
}

function normalizeProviderOptions(options: unknown): Record<string, string> {
  if (!options || typeof options !== "object" || Array.isArray(options)) return {};
  return Object.fromEntries(Object.entries(options as Record<string, unknown>)
    .map(([key, value]) => [key.trim(), String(value ?? "").trim()])
    .filter(([key, value]) => key && value));
}

function normalizeConnectors(connectors: unknown): BotConfig["connectors"] {
  if (!connectors || typeof connectors !== "object" || Array.isArray(connectors)) return {};
  const value = connectors as Record<string, unknown>;
  return {
    lark: normalizeConnector(value.lark),
    wecom: normalizeConnector(value.wecom),
    dingtalk: normalizeConnector(value.dingtalk)
  };
}

function normalizeConnector(connector: unknown): NonNullable<BotConfig["connectors"]>["lark"] | undefined {
  if (!connector || typeof connector !== "object" || Array.isArray(connector)) return undefined;
  const value = connector as Record<string, unknown>;
  const appId = String(value.appId ?? "").trim();
  const appSecret = String(value.appSecret ?? "");
  if (!appId || !appSecret) return undefined;
  return {
    enabled: value.enabled !== false,
    cliPath: typeof value.cliPath === "string" ? value.cliPath.trim() : undefined,
    profile: typeof value.profile === "string" ? value.profile.trim() : undefined,
    appId,
    appSecret,
    oauthScopes: normalizeScopes(value.oauthScopes),
    options: normalizeProviderOptions(value.options)
  };
}

function normalizeDeliveryRoutes(routes: unknown): BotConfig["deliveryRoutes"] {
  if (!Array.isArray(routes)) return [];
  const seen = new Set<string>();
  const result: NonNullable<BotConfig["deliveryRoutes"]> = [];
  for (const route of routes) {
    if (!route || typeof route !== "object") continue;
    const value = route as Record<string, unknown>;
    const id = String(value.id ?? "").trim();
    const provider = normalizeProvider(value.provider);
    const chatId = String(value.chatId ?? "").trim();
    if (!id || !chatId || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      enabled: value.enabled !== false,
      provider: provider ?? "lark",
      chatId,
      mode: "copy-final-reply",
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined
    });
  }
  return result;
}

function normalizeCapabilityRefs(refs: unknown): BotConfig["capabilityRefs"] {
  if (!Array.isArray(refs)) return [];
  const seen = new Set<string>();
  const result: NonNullable<BotConfig["capabilityRefs"]> = [];
  for (const ref of refs) {
    if (!ref || typeof ref !== "object") continue;
    const value = ref as Record<string, unknown>;
    const kind = String(value.kind ?? "");
    const id = String(value.id ?? "").trim();
    if (!["skill", "mcp", "app", "suite", "workflow", "command", "scheduled-task"].includes(kind) || !id) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const normalized: NonNullable<BotConfig["capabilityRefs"]>[number] = {
      kind: kind as NonNullable<BotConfig["capabilityRefs"]>[number]["kind"],
      id,
      enabled: value.enabled !== false
    };
    if (typeof value.alias === "string" && value.alias.trim()) normalized.alias = value.alias.trim();
    normalized.policy = normalizeCapabilityPolicy(
      normalized.kind,
      value.policy && typeof value.policy === "object" ? value.policy as Record<string, unknown> : null
    );
    result.push(normalized);
  }
  return result;
}

function normalizeCommandBindings(bindings: unknown): BotConfig["commandBindings"] {
  if (!Array.isArray(bindings)) return [];
  const seen = new Set<string>();
  const result: NonNullable<BotConfig["commandBindings"]> = [];
  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    const value = binding as Record<string, unknown>;
    const name = String(value.name ?? "").trim().toLowerCase();
    const target = value.target && typeof value.target === "object" ? value.target as Record<string, unknown> : null;
    const capability = target?.capability && typeof target.capability === "object" ? target.capability as Record<string, unknown> : null;
    const kind = String(capability?.kind ?? "");
    const id = String(capability?.id ?? "").trim();
    if (!/^[a-z0-9_-]+$/.test(name) || ["new", "continue", "owner", "help"].includes(name) || !["skill", "mcp", "app", "suite", "workflow"].includes(kind) || !id) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    result.push({
      name,
      aliases: normalizeCommandAliases(value.aliases, name),
      enabled: value.enabled !== false,
      description: typeof value.description === "string" && value.description.trim() ? value.description.trim() : undefined,
      promptTemplate: typeof value.promptTemplate === "string" && value.promptTemplate.trim() ? value.promptTemplate.trim() : undefined,
      target: {
        type: "capability",
        capability: {
          kind: kind as "skill" | "mcp" | "app" | "suite" | "workflow",
          id
        }
      }
    });
  }
  return result;
}

function normalizeCommandAliases(aliases: unknown, commandName: string): string[] {
  if (!Array.isArray(aliases)) return [];
  return [...new Set(aliases
    .flatMap((alias) => String(alias).split(/[\s,]+/))
    .map((alias) => alias.trim().toLowerCase().replace(/^\//, ""))
    .filter((alias) => /^[a-z0-9_-]+$/.test(alias) && alias !== commandName && !["new", "continue", "owner", "help"].includes(alias)))];
}

function normalizeScheduledTasks(tasks: unknown, botId: string): BotConfig["scheduledTasks"] {
  if (!Array.isArray(tasks)) return [];
  const seen = new Set<string>();
  const result: NonNullable<BotConfig["scheduledTasks"]> = [];
  for (const task of tasks) {
    if (!task || typeof task !== "object") continue;
    const value = task as Record<string, unknown>;
    const id = String(value.id ?? "").trim();
    const name = String(value.name ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    const schedule = value.schedule && typeof value.schedule === "object" ? value.schedule as Record<string, unknown> : null;
    const scheduleType = String(schedule?.type ?? "");
    const timezone = String(schedule?.timezone ?? "").trim() || "Asia/Shanghai";
    if (!["interval", "daily", "weekly", "cron"].includes(scheduleType)) continue;
    const target = value.target && typeof value.target === "object" ? value.target as Record<string, unknown> : null;
    const targetType = String(target?.type ?? "");
    const prompt = String(target?.prompt ?? "").trim();
    if (!["agent", "command", "capability"].includes(targetType) || !prompt) continue;
    const delivery = value.delivery && typeof value.delivery === "object" ? value.delivery as Record<string, unknown> : null;
    const chatId = String(delivery?.chatId ?? "").trim();
    if (String(delivery?.type ?? "chat") !== "chat" || !chatId) continue;
    const normalized: NonNullable<BotConfig["scheduledTasks"]>[number] = {
      id,
      botId,
      enabled: value.enabled !== false,
      name,
      schedule: {
        type: scheduleType as NonNullable<BotConfig["scheduledTasks"]>[number]["schedule"]["type"],
        timezone
      },
      target: {
        type: targetType as NonNullable<BotConfig["scheduledTasks"]>[number]["target"]["type"],
        prompt
      },
      delivery: {
        type: "chat",
        chatId,
        replyIdentity: delivery?.replyIdentity === "user" ? "user" : delivery?.replyIdentity === "bot" ? "bot" : undefined
      }
    };
    const retry = value.retry && typeof value.retry === "object" ? value.retry as Record<string, unknown> : null;
    if (retry) {
      const maxRetries = Math.max(0, Math.min(20, Math.floor(Number(retry.maxRetries ?? 0) || 0)));
      const delayMinutes = Math.max(1, Math.min(24 * 60, Math.floor(Number(retry.delayMinutes ?? 10) || 10)));
      if (maxRetries > 0) normalized.retry = { maxRetries, delayMinutes };
    }
    if (scheduleType === "interval") {
      const everyMinutes = Math.max(5, Math.min(7 * 24 * 60, Number(schedule?.everyMinutes ?? 60) || 60));
      normalized.schedule.everyMinutes = everyMinutes;
    }
    if (scheduleType === "daily" || scheduleType === "weekly") {
      const timeOfDay = String(schedule?.timeOfDay ?? "").trim();
      if (!/^\d{2}:\d{2}$/.test(timeOfDay)) continue;
      normalized.schedule.timeOfDay = timeOfDay;
    }
    if (scheduleType === "weekly") {
      const weekdays = Array.isArray(schedule?.weekdays)
        ? [...new Set(schedule.weekdays.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))]
        : [];
      if (weekdays.length === 0) continue;
      normalized.schedule.weekdays = weekdays;
    }
    if (scheduleType === "cron") {
      const cronExpression = String(schedule?.cronExpression ?? "").trim().replace(/\s+/g, " ");
      if (!isValidCronExpression(cronExpression)) continue;
      normalized.schedule.cronExpression = cronExpression;
    }
    if (targetType === "command") {
      const commandName = String(target?.commandName ?? "").trim().toLowerCase();
      if (!/^[a-z0-9_-]+$/.test(commandName)) continue;
      normalized.target.commandName = commandName;
    }
    if (targetType === "capability") {
      const capability = target?.capability && typeof target.capability === "object" ? target.capability as Record<string, unknown> : null;
      const kind = String(capability?.kind ?? "");
      const capabilityId = String(capability?.id ?? "").trim();
      if (!["skill", "mcp", "app", "suite", "workflow"].includes(kind) || !capabilityId) continue;
      normalized.target.capability = {
        kind: kind as "skill" | "mcp" | "app" | "suite" | "workflow",
        id: capabilityId
      };
    }
    result.push(normalized);
    seen.add(id);
  }
  return result;
}

function normalizeCapabilityPolicy(kind: NonNullable<BotConfig["capabilityRefs"]>[number]["kind"], policy: Record<string, unknown> | null) {
  const defaults = defaultCapabilityPolicy(kind);
  if (!policy) return defaults;
  return {
    allowAgentUse: typeof policy.allowAgentUse === "boolean" ? policy.allowAgentUse : defaults.allowAgentUse,
    allowCommandUse: typeof policy.allowCommandUse === "boolean" ? policy.allowCommandUse : defaults.allowCommandUse,
    allowScheduledUse: typeof policy.allowScheduledUse === "boolean" ? policy.allowScheduledUse : defaults.allowScheduledUse,
    requireOwnerApproval: typeof policy.requireOwnerApproval === "boolean" ? policy.requireOwnerApproval : defaults.requireOwnerApproval
  };
}

function defaultCapabilityPolicy(kind: NonNullable<BotConfig["capabilityRefs"]>[number]["kind"]) {
  switch (kind) {
    case "skill":
      return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true, requireOwnerApproval: false };
    case "app":
      return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true, requireOwnerApproval: false };
    case "suite":
      return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true, requireOwnerApproval: false };
    case "workflow":
      return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true, requireOwnerApproval: false };
    case "mcp":
      return { allowAgentUse: true, allowCommandUse: false, allowScheduledUse: false, requireOwnerApproval: false };
    default:
      return { allowAgentUse: true, allowCommandUse: false, allowScheduledUse: false, requireOwnerApproval: false };
  }
}

function normalizeMcpServers(servers: unknown): AppConfig["mcpServers"] {
  if (!Array.isArray(servers)) return [];
  const seen = new Set<string>();
  const result: AppConfig["mcpServers"] = [];
  for (const server of servers) {
    if (!server || typeof server !== "object") continue;
    const value = server as Record<string, unknown>;
    const id = String(value.id ?? "").trim();
    const name = String(value.name ?? "").trim();
    const command = String(value.command ?? "").trim();
    const transport = ["stdio", "http", "sse"].includes(String(value.transport ?? "")) ? String(value.transport) as "stdio" | "http" | "sse" : "stdio";
    const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : undefined;
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const normalized: AppConfig["mcpServers"][number] = {
      id,
      name,
      enabled: value.enabled !== false,
      transport,
      command,
      args: Array.isArray(value.args) ? value.args.map((item) => String(item).trim()).filter(Boolean) : [],
      env: Array.isArray(value.env)
        ? value.env
          .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            name: String(item.name ?? "").trim(),
            value: String(item.value ?? ""),
            secret: item.secret === true
          }))
          .filter((item) => item.name)
        : [],
      cwd: typeof value.cwd === "string" && value.cwd.trim() ? value.cwd.trim() : undefined,
      description: typeof value.description === "string" && value.description.trim() ? value.description.trim() : undefined,
      timeoutMs: Number(value.timeoutMs) >= 1000 ? Number(value.timeoutMs) : undefined,
      alwaysLoad: value.alwaysLoad === true
    };
    if (transport !== "stdio") normalized.url = url;
    result.push(normalized);
  }
  return result;
}
