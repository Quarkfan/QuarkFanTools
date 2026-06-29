import type { ChatMessage } from "./types.js";

export function processedKeysForMessage(message: Pick<ChatMessage, "eventId" | "messageId">): string[] {
  return [
    message.eventId ? `event:${message.eventId}` : "",
    message.messageId ? `message:${message.messageId}` : ""
  ].filter(Boolean);
}

export function hasProcessedMessage(processed: Set<string> | undefined, message: Pick<ChatMessage, "eventId" | "messageId">): boolean {
  if (!processed) return false;
  return processedKeysForMessage(message).some((key) => processed.has(key))
    || Boolean(message.eventId && processed.has(message.eventId))
    || Boolean(message.messageId && processed.has(message.messageId));
}

export function markProcessedMessage(processed: Set<string>, message: Pick<ChatMessage, "eventId" | "messageId">): void {
  for (const key of processedKeysForMessage(message)) processed.add(key);
}
