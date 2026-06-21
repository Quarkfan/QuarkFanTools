import type { AppConfig, BotConfig } from "./types.js";

export type LegacyConfig = Partial<AppConfig> & {
  lark?: Partial<Omit<BotConfig, "id" | "name" | "enabled" | "skillNames" | "pendingReaction" | "ownerOpenId">>;
};

export function mergeConfig(base: AppConfig, override: LegacyConfig): AppConfig {
  const legacyBot = override.lark?.appId
    ? [{
        id: "default",
        name: "默认机器人",
        enabled: true,
        cliPath: override.lark.cliPath ?? "",
        profile: override.lark.profile ?? "",
        appId: override.lark.appId,
        appSecret: override.lark.appSecret ?? "",
        receiveIdentity: override.lark.receiveIdentity ?? "bot",
        replyIdentity: override.lark.replyIdentity ?? "bot",
        eventTypes: override.lark.eventTypes ?? ["im.message.receive_v1"],
        oauthScopes: [],
        skillNames: [],
        pendingReaction: "OnIt",
        ownerOpenId: "",
        showProgress: false
      } satisfies BotConfig]
    : [];
  const bots = normalizeBotIds((override.bots ?? legacyBot).map((bot) => ({
    ...bot,
    skillNames: (bot.skillNames ?? []).filter((name) => name !== "*"),
    oauthScopes: normalizeScopes(bot.oauthScopes),
    pendingReaction: bot.pendingReaction || "OnIt",
    ownerOpenId: bot.ownerOpenId || "",
    showProgress: bot.showProgress ?? false
  })));
  return {
    ...base,
    ...override,
    bots,
    skillMarket: { ...base.skillMarket, ...override.skillMarket },
    model: { ...base.model, ...override.model },
    runtime: {
      ...base.runtime,
      ...override.runtime,
      maxAgentTurns: Math.max(10, Math.min(100, override.runtime?.maxAgentTurns ?? base.runtime.maxAgentTurns ?? 60)),
      botIsolationMode: normalizeIsolationMode(override.runtime?.botIsolationMode ?? base.runtime.botIsolationMode)
    }
  };
}

function normalizeBotIds(bots: BotConfig[]): BotConfig[] {
  const used = new Set<string>();
  return bots.map((bot, index) => {
    const base = normalizeBotId(bot.id || `bot-${index + 1}`) || `bot-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id === bot.id ? bot : { ...bot, id };
  });
}

function normalizeBotId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return [];
  return [...new Set(scopes
    .flatMap((scope) => String(scope).split(/[\s,]+/))
    .map((scope) => scope.trim())
    .filter(Boolean))];
}

function normalizeIsolationMode(value: unknown): "process" | "container" | "auto" {
  return value === "container" || value === "auto" ? value : "process";
}
