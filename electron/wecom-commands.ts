import type { BotConfig } from "./types.js";

export function wecomMethodArgs(category: string, method: string, payload: unknown): string[] {
  return [category, method, JSON.stringify(payload ?? {})];
}

export function isWeComEventSubscribeCommand(command: string): boolean {
  return /(?:wecom|wechatwork|wxwork)-cli\b.*\b(msg\s+get_message|event|callback|poll)\b/.test(command);
}

export function wecomEventBridgeCommand(bot: BotConfig): string {
  return bot.providerOptions?.eventCommand?.trim() ?? "";
}
