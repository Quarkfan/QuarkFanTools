import type { BotConfig } from "./types.js";
import { effectiveBotProfile } from "./bot-identity.js";

export const DEFAULT_LARK_USER_OAUTH_SCOPES = ["search:docs:read"];

function profileArgs(bot: BotConfig): string[] {
  return ["--profile", effectiveBotProfile(bot)];
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

export function larkUserLoginArgs(extraScopes: string[] = []): string[] {
  const scopes = [...new Set([...DEFAULT_LARK_USER_OAUTH_SCOPES, ...extraScopes
    .flatMap((scope) => scope.split(/[\s,]+/))
    .map((scope) => scope.trim())
    .filter(Boolean)])];
  return ["auth", "login", "--recommend", "--scope", scopes.join(","), "--no-wait", "--json"];
}

export function isLarkEventSubscribeCommand(command: string): boolean {
  return /lark-cli\b.*\bevent\s+\+subscribe\b/.test(command);
}

export function filterLarkEventStderr(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/\[SDK Error\] handle message failed.*event type: im\.message\.reaction\.(?:created|deleted)_v1, not found handler/.test(line))
    .join("\n")
    .trim();
}
