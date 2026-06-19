import type { BotConfig, LarkMention, LarkMessage } from "./types.js";

export interface MessageTargetDecision {
  targeted: boolean;
  reason: string;
  sourceAppId?: string;
  mentionValues: string[];
  botMatchers: string[];
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function mentionValues(mention: LarkMention): string[] {
  return [
    mention.key,
    mention.name,
    mention.id?.appId,
    mention.id?.openId,
    mention.id?.userId,
    mention.id?.unionId
  ].filter((value): value is string => Boolean(value));
}

export function messageTargetsBot(bot: BotConfig, message: LarkMessage): boolean {
  return messageTargetDecision(bot, message).targeted;
}

export function messageTargetDecision(bot: BotConfig, message: LarkMessage): MessageTargetDecision {
  const mentions = message.mentions ?? [];
  const botMatchers = [bot.id, bot.name, bot.appId]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalize(value));
  const sourceAppId = normalize(message.sourceAppId);
  if (sourceAppId) {
    return {
      targeted: sourceAppId === normalize(bot.appId),
      reason: sourceAppId === normalize(bot.appId) ? "source-app-id-match" : "source-app-id-mismatch",
      sourceAppId: message.sourceAppId,
      mentionValues: mentions.flatMap(mentionValues),
      botMatchers
    };
  }
  if (mentions.length === 0) {
    return { targeted: true, reason: "no-mention-metadata", mentionValues: [], botMatchers };
  }
  const matcherSet = new Set(botMatchers);
  const values = mentions.flatMap(mentionValues);
  for (const mention of mentions) {
    for (const value of mentionValues(mention)) {
      if (matcherSet.has(normalize(value))) {
        return { targeted: true, reason: "mention-match", mentionValues: values, botMatchers };
      }
    }
  }
  return { targeted: false, reason: "mention-mismatch", mentionValues: values, botMatchers };
}
