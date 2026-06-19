import type { BotConfig } from "./types.js";
import { effectiveBotProfile } from "./bot-identity.js";

export function normalizeLarkConfigProfilesContent(raw: string, bot: BotConfig): string | null {
  if (!raw.trim()) return null;
  let parsed: { apps?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.apps)) return null;
  const profile = effectiveBotProfile(bot);
  const matchingApps = parsed.apps.filter((appItem) => appItem.appId === bot.appId);
  const named = matchingApps.find((appItem) => appItem.name === profile);
  const fallback = named ?? matchingApps[0];
  if (!fallback) return null;
  const normalized = { ...fallback, name: profile };
  const otherApps = parsed.apps.filter((appItem) => appItem.appId !== bot.appId);
  return `${JSON.stringify({ ...parsed, apps: [...otherApps, normalized] }, null, 2)}\n`;
}
