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
  const bots = (override.bots ?? legacyBot).map((bot) => ({
    ...bot,
    skillNames: (bot.skillNames ?? []).filter((name) => name !== "*"),
    oauthScopes: normalizeScopes(bot.oauthScopes),
    pendingReaction: bot.pendingReaction || "OnIt",
    ownerOpenId: bot.ownerOpenId || "",
    showProgress: bot.showProgress ?? false
  }));
  return {
    ...base,
    ...override,
    bots,
    skillMarket: { ...base.skillMarket, ...override.skillMarket },
    model: { ...base.model, ...override.model },
    runtime: {
      ...base.runtime,
      ...override.runtime,
      maxAgentTurns: Math.max(10, Math.min(100, override.runtime?.maxAgentTurns ?? base.runtime.maxAgentTurns ?? 60))
    }
  };
}

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return [];
  return [...new Set(scopes
    .flatMap((scope) => String(scope).split(/[\s,]+/))
    .map((scope) => scope.trim())
    .filter(Boolean))];
}
