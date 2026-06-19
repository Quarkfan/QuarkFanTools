import type { BotConfig } from "./types.js";

export function normalizeAppId(value: string): string {
  return value.trim().toLowerCase();
}

export function maskAppId(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.length <= 10) return `${normalized.slice(0, 3)}***`;
  return `${normalized.slice(0, 6)}***${normalized.slice(-4)}`;
}

export function effectiveBotProfile(bot: BotConfig): string {
  return bot.profile || `qft-${bot.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function runningBotWithSameAppId(bot: BotConfig, bots: BotConfig[], runningBotIds: Iterable<string>): BotConfig | null {
  const appId = normalizeAppId(bot.appId);
  if (!appId) return null;
  const running = new Set(runningBotIds);
  return bots.find((item) => item.id !== bot.id && running.has(item.id) && normalizeAppId(item.appId) === appId) ?? null;
}
