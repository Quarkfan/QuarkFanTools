import type { LarkMention, LarkMessage, LarkMessageResource } from "./types.js";

function extractText(payload: any): string {
  const content = payload?.event?.message?.content ?? payload?.message?.content ?? payload?.content ?? "";
  if (typeof content !== "string") return "";
  try {
    const parsed = JSON.parse(content);
    return typeof parsed.text === "string"
      ? parsed.text.trim()
      : typeof parsed.content === "string" ? parsed.content.trim() : "";
  } catch {
    return content.trim();
  }
}

function parseContent(content: unknown): any {
  if (typeof content !== "string") return content ?? {};
  try {
    return JSON.parse(content || "{}");
  } catch {
    return { text: content };
  }
}

function extractResources(value: unknown, resources: Map<string, LarkMessageResource>): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.file_key === "string" && record.file_key) {
    resources.set(record.file_key, {
      key: record.file_key,
      type: "file",
      name: typeof record.file_name === "string" ? record.file_name : undefined
    });
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && key === "image_key" && child) {
      resources.set(child, { key: child, type: "image" });
    } else if (typeof child === "string" && key === "file_key" && child) {
      if (!resources.has(child)) resources.set(child, { key: child, type: "file" });
    } else {
      extractResources(child, resources);
    }
  }
}

function extractMentions(value: unknown): LarkMention[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const id = typeof item.id === "object" && item.id !== null ? item.id as Record<string, unknown> : {};
      return {
        key: typeof item.key === "string" ? item.key : undefined,
        name: typeof item.name === "string" ? item.name : undefined,
        tenantKey: typeof item.tenant_key === "string" ? item.tenant_key : undefined,
        id: {
          openId: firstString(id.open_id, id.openId),
          userId: firstString(id.user_id, id.userId),
          unionId: firstString(id.union_id, id.unionId),
          appId: firstString(id.app_id, id.appId, id.application_id, id.open_app_id)
        }
      };
    });
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function extractSourceAppId(payload: any): string | undefined {
  return firstString(
    payload?.header?.app_id,
    payload?.header?.appId,
    payload?.event?.app_id,
    payload?.event?.appId,
    payload?.app_id,
    payload?.appId
  );
}

export function normalizeLarkEvent(payload: any): LarkMessage | null {
  const event = payload?.event ?? payload;
  const message = event?.message ?? event;
  const sender = event?.sender?.sender_id ?? event?.sender ?? {};
  const eventType = payload?.header?.event_type ?? payload?.event_type ?? "";
  if (eventType && eventType !== "im.message.receive_v1") return null;
  const messageId = String(message?.message_id ?? message?.messageId ?? "");
  if (!messageId) return null;
  const messageType = String(message?.message_type ?? message?.messageType ?? "text");
  const content = parseContent(message?.content);
  const resources = new Map<string, LarkMessageResource>();
  extractResources(content, resources);
  const text = extractText(payload)
    || (messageType === "image" ? "[图片消息]" : "")
    || (messageType === "file" ? `[文件消息: ${String(content?.file_name ?? "未命名文件")}]` : "")
    || `[${messageType} 消息]`;
  return {
    eventId: String(payload?.header?.event_id ?? payload?.event_id ?? messageId),
    messageId,
    chatId: String(message?.chat_id ?? message?.chatId ?? ""),
    chatType: normalizeLarkChatType(message?.chat_type ?? message?.chatType),
    senderId: String(sender?.open_id ?? sender?.user_id ?? sender?.union_id ?? ""),
    messageType,
    text,
    resources: [...resources.values()],
    createdAt: payload?.header?.create_time ? String(payload.header.create_time) : undefined,
    receivedAt: new Date().toISOString(),
    provider: "lark",
    sourceAppId: extractSourceAppId(payload),
    mentions: extractMentions(message?.mentions),
    raw: payload
  };
}

function normalizeLarkChatType(value: unknown): string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[-\s]/g, "_");
  if (["group", "group_chat", "chat_group"].includes(normalized) || normalized.endsWith("_group")) return "group";
  if (["p2p", "private", "private_chat", "single", "direct"].includes(normalized)) return "p2p";
  return raw;
}
