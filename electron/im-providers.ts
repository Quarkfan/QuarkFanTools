import type { EventEmitter } from "node:events";
import { addMessageReaction as addLarkMessageReaction, downloadMessageResources as downloadLarkMessageResources, LarkEventStream, removeMessageReaction as removeLarkMessageReaction, replyToMessage as replyToLarkMessage, sendCardToUser as sendLarkCardToUser, sendTextToChat as sendLarkTextToChat } from "./lark-cli.js";
import { downloadWeComMessageResources, replyToWeComMessage, sendWeComCardToUser, sendWeComTextToChat, WeComEventStream } from "./wecom-cli.js";
import { primaryProvider } from "./platform-connectors.js";
import type { BotConfig, ChatMessage, ImProviderId } from "./types.js";

export interface ImEventStream extends EventEmitter {
  start(bot: BotConfig): Promise<void>;
  stop(): Promise<void>;
}

export interface ImProvider {
  id: ImProviderId;
  label: string;
  createStream(): ImEventStream;
  replyToMessage(bot: BotConfig, messageId: string, text: string): Promise<void>;
  sendTextToChat(bot: BotConfig, chatId: string, text: string): Promise<void>;
  sendCardToUser(bot: BotConfig, userId: string, card: unknown, idempotencyKey: string): Promise<void>;
  addMessageReaction(bot: BotConfig, messageId: string, emojiType: string): Promise<string>;
  removeMessageReaction(bot: BotConfig, messageId: string, reactionId: string): Promise<void>;
  downloadMessageResources(bot: BotConfig, message: ChatMessage, outputDir: string): Promise<ChatMessage>;
}

const larkProvider: ImProvider = {
  id: "lark",
  label: "飞书",
  createStream: () => new LarkEventStream(),
  replyToMessage: replyToLarkMessage,
  sendTextToChat: (bot, chatId, text) => sendLarkTextToChat(bot, chatId, text),
  sendCardToUser: sendLarkCardToUser,
  addMessageReaction: addLarkMessageReaction,
  removeMessageReaction: removeLarkMessageReaction,
  downloadMessageResources: downloadLarkMessageResources
};

const wecomProvider: ImProvider = {
  id: "wecom",
  label: "企业微信",
  createStream: () => new WeComEventStream(),
  replyToMessage: replyToWeComMessage,
  sendTextToChat: sendWeComTextToChat,
  sendCardToUser: sendWeComCardToUser,
  addMessageReaction: async () => "",
  removeMessageReaction: async () => undefined,
  downloadMessageResources: downloadWeComMessageResources
};

export function imProviderForBot(bot: BotConfig): ImProvider {
  return imProvider(primaryProvider(bot));
}

export function imProvider(provider: ImProviderId): ImProvider {
  if (provider === "wecom") throw new Error("企业微信 Provider 因官方能力限制暂时封闭");
  if (provider === "dingtalk") throw new Error("钉钉 IM Provider 尚未实现");
  return larkProvider;
}
