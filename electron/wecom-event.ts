import type { ChatMessage, ChatMessageResource } from "./types.js";

function textFromPayload(payload: any): string {
  const value = payload?.text?.content
    ?? payload?.content
    ?? payload?.Content
    ?? payload?.message?.text
    ?? payload?.message?.content
    ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function collectResources(value: unknown, resources: Map<string, ChatMessageResource>): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /media_?id|file_?id|file_?key/i.test(key) && child) {
      resources.set(child, { key: child, type: "file" });
    } else if (typeof child === "string" && /image_?id|pic_?url|image_?key/i.test(key) && child) {
      resources.set(child, { key: child, type: "image" });
    } else {
      collectResources(child, resources);
    }
  }
}

export function normalizeWeComEvent(payload: any): ChatMessage | null {
  const event = payload?.event ?? payload?.message ?? payload;
  const messageType = String(event?.msgtype ?? event?.MsgType ?? event?.messageType ?? event?.type ?? "text");
  const messageId = String(event?.msgid ?? event?.MsgId ?? event?.message_id ?? event?.messageId ?? event?.id ?? "");
  if (!messageId) return null;
  const resources = new Map<string, ChatMessageResource>();
  collectResources(event, resources);
  const text = textFromPayload(event)
    || (messageType === "image" ? "[图片消息]" : "")
    || (messageType === "file" ? `[文件消息: ${String(event?.filename ?? event?.file_name ?? "未命名文件")}]` : "")
    || `[${messageType} 消息]`;
  return {
    eventId: String(payload?.event_id ?? payload?.eventId ?? event?.event_id ?? event?.eventId ?? messageId),
    messageId,
    chatId: String(event?.chatid ?? event?.chat_id ?? event?.roomid ?? event?.room_id ?? event?.conversation_id ?? event?.touser ?? ""),
    chatType: String(event?.chat_type ?? event?.chatType ?? (event?.roomid || event?.room_id ? "group" : "p2p")),
    senderId: String(event?.from ?? event?.FromUserName ?? event?.userid ?? event?.user_id ?? event?.sender_id ?? ""),
    messageType,
    text,
    resources: [...resources.values()],
    createdAt: event?.CreateTime ? String(event.CreateTime) : event?.create_time ? String(event.create_time) : undefined,
    receivedAt: new Date().toISOString(),
    provider: "wecom",
    raw: payload
  };
}
