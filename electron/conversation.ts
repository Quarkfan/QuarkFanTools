import type { LarkMessage } from "./types.js";

export function conversationKey(message: LarkMessage): string {
  const chat = message.chatId || message.senderId || message.messageId;
  return message.chatType === "p2p" ? chat : `${chat}:${message.senderId || "unknown"}`;
}
