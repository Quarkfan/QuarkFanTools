import type { BotConfig, LarkBotIdentity, LarkMention, LarkMessage } from "./types.js";

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

export function messageTargetsBot(bot: BotConfig, message: LarkMessage, identity?: LarkBotIdentity, strictGroupTargeting = false): boolean {
  return messageTargetDecision(bot, message, identity, strictGroupTargeting).targeted;
}

export function messageTargetDecision(bot: BotConfig, message: LarkMessage, identity?: LarkBotIdentity, strictGroupTargeting = false): MessageTargetDecision {
  const mentions = message.mentions ?? [];
  const botMatchers = [bot.id, bot.name, bot.appId, identity?.openId, identity?.appName]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalize(value));
  const values = mentions.flatMap(mentionValues);
  const matcherSet = new Set(botMatchers);
  if (mentions.length > 0) {
    const matched = mentions.some((mention) => mentionValues(mention).some((value) => matcherSet.has(normalize(value))));
    const matchedByOpenId = Boolean(identity?.openId && mentions.some((mention) => normalize(mention.id?.openId) === normalize(identity.openId)));
    if (matched) {
      return {
        targeted: true,
        reason: matchedByOpenId ? "bot-open-id-mention-match" : "mention-match",
        botOpenId: identity?.openId,
        sourceAppId: message.sourceAppId,
        mentionValues: values,
        botMatchers
      };
    }
    return {
      targeted: false,
      reason: matchedByOpenId ? "bot-open-id-mention-mismatch" : "mention-mismatch",
      botOpenId: identity?.openId,
      sourceAppId: message.sourceAppId,
      mentionValues: values,
      botMatchers
    };
  }
  const sourceAppId = normalize(message.sourceAppId);
  if (strictGroupTargeting && message.chatType === "group") {
    return {
      targeted: false,
      reason: "missing-group-mention-metadata",
      sourceAppId: message.sourceAppId,
      botOpenId: identity?.openId,
      mentionValues: values,
      botMatchers
    };
  }
  if (sourceAppId) {
    return {
      targeted: sourceAppId === normalize(bot.appId),
      reason: sourceAppId === normalize(bot.appId) ? "source-app-id-match" : "source-app-id-mismatch",
      sourceAppId: message.sourceAppId,
      mentionValues: values,
      botMatchers
    };
  }
  const targeted = !(strictGroupTargeting && message.chatType === "group");
  return {
    targeted,
    reason: targeted ? "no-mention-metadata" : "missing-group-mention-metadata",
    botOpenId: identity?.openId,
    mentionValues: [],
    botMatchers
  };
}
