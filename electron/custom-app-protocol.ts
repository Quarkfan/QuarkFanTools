import type { CustomAppDeliveryRequest } from "./types.js";

export function normalizeCustomAppDeliveries(value: unknown): CustomAppDeliveryRequest[] {
  if (!Array.isArray(value)) return [];
  const result: CustomAppDeliveryRequest[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const routeId = String(raw.routeId ?? "").trim();
    if (!routeId || seen.has(routeId)) continue;
    const text = typeof raw.text === "string" && raw.text.trim() ? raw.text.trim() : undefined;
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 80) : undefined;
    result.push({
      routeId,
      text,
      useReply: raw.useReply !== false,
      label
    });
    seen.add(routeId);
  }
  return result.slice(0, 10);
}

export function resolveReplyDeliveries(deliveries: CustomAppDeliveryRequest[], reply: string): CustomAppDeliveryRequest[] {
  return deliveries
    .map((delivery) => ({
      ...delivery,
      text: delivery.text || (delivery.useReply !== false ? reply : "")
    }))
    .filter((delivery) => delivery.text?.trim());
}
