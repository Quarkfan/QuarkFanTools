import type { BotConfig, ChatMessage, LarkBotIdentity, LarkMention } from "./types.js";

export interface MessageTargetDecision {
  targeted: boolean;
  reason: string;
  sourceAppId?: string;
  botOpenId?: string;
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

export function messageTargetsBot(bot: BotConfig, message: ChatMessage, identity?: LarkBotIdentity, strictGroupTargeting = false): boolean {
  return messageTargetDecision(bot, message, identity, strictGroupTargeting).targeted;
}

export function messageTargetDecision(bot: BotConfig, message: ChatMessage, identity?: LarkBotIdentity, strictGroupTargeting = false): MessageTargetDecision {
  const mentions = message.mentions ?? [];
  const botMatchers = [bot.id, bot.name, bot.appId, identity?.openId, identity?.appName]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalize(value));
  const values = mentions.flatMap(mentionValues);
  if (identity?.openId && mentions.length > 0) {
    const botOpenId = normalize(identity.openId);
    const matched = mentions.some((mention) => normalize(mention.id?.openId) === botOpenId);
    return {
      targeted: matched,
      reason: matched ? "bot-open-id-mention-match" : "bot-open-id-mention-mismatch",
      botOpenId: identity.openId,
      sourceAppId: message.sourceAppId,
      mentionValues: values,
      botMatchers
    };
  }
  const sourceAppId = normalize(message.sourceAppId);
  if (sourceAppId) {
    const matched = botMatchers.includes(sourceAppId);
    return {
      targeted: matched,
      reason: matched ? "source-app-id-match" : "source-app-id-mismatch",
      sourceAppId: message.sourceAppId,
      mentionValues: values,
      botMatchers
    };
  }
  if (mentions.length === 0) {
    const targeted = !(strictGroupTargeting && message.chatType === "group");
    return {
      targeted,
      reason: targeted ? "no-mention-metadata" : "missing-group-mention-metadata",
      botOpenId: identity?.openId,
      mentionValues: [],
      botMatchers
    };
  }
  const matcherSet = new Set(botMatchers);
  for (const mention of mentions) {
    for (const value of mentionValues(mention)) {
      if (matcherSet.has(normalize(value))) {
        return {
          targeted: true,
          reason: "mention-match",
          botOpenId: identity?.openId,
          sourceAppId: message.sourceAppId,
          mentionValues: values,
          botMatchers
        };
      }
    }
  }
  return {
    targeted: false,
    reason: "mention-mismatch",
    botOpenId: identity?.openId,
    sourceAppId: message.sourceAppId,
    mentionValues: values,
    botMatchers
  };
}
