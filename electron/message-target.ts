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

export function isLarkGroupChat(chatType: string | undefined): boolean {
  const normalized = normalize(chatType).replace(/[-\s]/g, "_");
  return normalized === "group" || normalized === "group_chat" || normalized === "chat_group" || normalized.endsWith("_group");
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
  if (strictGroupTargeting && isLarkGroupChat(message.chatType)) {
    return {
      targeted: false,
      reason: "missing-group-mention-metadata",
      botOpenId: identity?.openId,
      sourceAppId: message.sourceAppId,
      mentionValues: values,
      botMatchers
    };
  }
  const sourceAppId = normalize(message.sourceAppId);
  if (sourceAppId) {
    const matched = sourceAppId === normalize(bot.appId);
    return {
      targeted: matched,
      reason: matched ? "source-app-id-match" : "source-app-id-mismatch",
      sourceAppId: message.sourceAppId,
      mentionValues: values,
      botMatchers
    };
  }
  const targeted = true;
  return {
    targeted,
    reason: "no-mention-metadata",
    botOpenId: identity?.openId,
    mentionValues: [],
    botMatchers
  };
}
