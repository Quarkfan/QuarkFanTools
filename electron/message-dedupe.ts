import type { LarkMessage } from "./types.js";

export function processedMessageKeys(message: Pick<LarkMessage, "eventId" | "messageId">): string[] {
  return [
    message.eventId,
    `event:${message.eventId}`,
    `message:${message.messageId}`
  ];
}

export function hasProcessedMessage(processed: Set<string> | undefined, message: Pick<LarkMessage, "eventId" | "messageId">): boolean {
  if (!processed) return false;
  return processedMessageKeys(message).some((key) => processed.has(key));
}

export function markProcessedMessage(processed: Set<string>, message: Pick<LarkMessage, "eventId" | "messageId">): void {
  for (const key of processedMessageKeys(message)) {
    processed.add(key);
  }
}
