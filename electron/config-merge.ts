import type { AppConfig, BotConfig } from "./types.js";

export type LegacyConfig = Partial<AppConfig> & {
  lark?: Partial<Omit<BotConfig, "id" | "name" | "enabled" | "skillNames" | "pendingReply">>;
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
        skillNames: ["*"],
        pendingReply: "正在查询，请稍候…"
      } satisfies BotConfig]
    : [];
  return {
    ...base,
    ...override,
    bots: override.bots ?? legacyBot,
    model: { ...base.model, ...override.model },
    runtime: { ...base.runtime, ...override.runtime }
  };
}
