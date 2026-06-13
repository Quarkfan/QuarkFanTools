import type { LarkMessage } from "./types.js";

function extractText(payload: any): string {
  const content = payload?.event?.message?.content ?? payload?.message?.content ?? payload?.content ?? "";
  if (typeof content !== "string") return "";
  try {
    const parsed = JSON.parse(content);
    return String(parsed.text ?? parsed.content ?? content).trim();
  } catch {
    return content.trim();
  }
}

export function normalizeLarkEvent(payload: any): LarkMessage | null {
  const event = payload?.event ?? payload;
  const message = event?.message ?? event;
  const sender = event?.sender?.sender_id ?? event?.sender ?? {};
  const eventType = payload?.header?.event_type ?? payload?.event_type ?? "";
  if (eventType && eventType !== "im.message.receive_v1") return null;
  const messageId = String(message?.message_id ?? message?.messageId ?? "");
  const text = extractText(payload);
  if (!messageId || !text) return null;
  return {
    eventId: String(payload?.header?.event_id ?? payload?.event_id ?? messageId),
    messageId,
    chatId: String(message?.chat_id ?? message?.chatId ?? ""),
    chatType: String(message?.chat_type ?? message?.chatType ?? ""),
    senderId: String(sender?.open_id ?? sender?.user_id ?? sender?.union_id ?? ""),
    text,
    createdAt: payload?.header?.create_time ? String(payload.header.create_time) : undefined,
    receivedAt: new Date().toISOString(),
    raw: payload
  };
}
