import type { BotConfig, ImProviderId } from "./types.js";

export function primaryProvider(bot: BotConfig): ImProviderId {
  return bot.provider ?? "lark";
}

export function larkConnectorBot(bot: BotConfig): BotConfig | null {
  if (primaryProvider(bot) === "lark") return { ...bot, provider: "lark" };
  const connector = bot.connectors?.lark;
  if (!connector?.enabled) return null;
  return {
    ...bot,
    provider: "lark",
    cliPath: connector.cliPath ?? "",
    profile: connector.profile ?? "",
    appId: connector.appId,
    appSecret: connector.appSecret,
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    providerOptions: connector.options ?? {},
    oauthScopes: connector.oauthScopes ?? []
  };
}

export function larkConnectorEnabled(bot: BotConfig): boolean {
  return Boolean(larkConnectorBot(bot));
}
