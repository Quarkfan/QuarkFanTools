import { randomUUID } from "node:crypto";
import type { LarkMessage } from "./types.js";

export type EscalationType = "help" | "approval";

export interface EscalationRequest {
  id: string;
  type: EscalationType;
  summary: string;
}

export function parseEscalation(response: string): EscalationRequest | null {
  const match = response.match(/OWNER_ESCALATION:\s*(\{[\s\S]*\})\s*$/);
  if (!match?.[1]) return null;
  try {
    const value = JSON.parse(match[1]) as Partial<EscalationRequest>;
    if ((value.type !== "help" && value.type !== "approval") || !String(value.summary ?? "").trim()) return null;
    return { id: randomUUID().slice(0, 8), type: value.type, summary: String(value.summary).trim() };
  } catch {
    return null;
  }
}

export function ownerDecision(message: LarkMessage): { id: string; response: string } | null {
  const match = message.text.trim().match(/^\/owner\s+([a-zA-Z0-9-]+)\s+(通过|拒绝|回复)\s*(.*)$/s);
  if (!match) return null;
  const [, id = "", action = "", detail = ""] = match;
  if (action === "通过") return { id, response: detail.trim() || "Owner 已通过该授权请求。" };
  if (action === "拒绝") return { id, response: detail.trim() || "Owner 已拒绝该授权请求。" };
  if (!detail.trim()) return null;
  return { id, response: detail.trim() };
}
