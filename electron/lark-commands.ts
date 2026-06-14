import type { BotConfig } from "./types.js";

function profileArgs(bot: BotConfig): string[] {
  return bot.profile ? ["--profile", bot.profile] : [];
}

export function larkEventSubscribeArgs(bot: BotConfig): string[] {
  return [
    ...profileArgs(bot),
    "event",
    "+subscribe",
    "--as",
    bot.receiveIdentity,
    "--event-types",
    bot.eventTypes.join(","),
    "--format",
    "ndjson"
  ];
}

export function isLarkEventSubscribeCommand(command: string): boolean {
  return /lark-cli\b.*\bevent\s+\+subscribe\b/.test(command);
}
