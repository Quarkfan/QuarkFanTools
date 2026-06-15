import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { BotConfig, LarkMessage } from "./types.js";
import type { EscalationRequest, EscalationType } from "./escalation-protocol.js";

export { ownerDecision, parseEscalation } from "./escalation-protocol.js";

export interface PendingEscalation extends EscalationRequest {
  messageId: string;
  senderId: string;
  createdAt: string;
}

export function escalationCard(bot: BotConfig, request: PendingEscalation): unknown {
  const actionHint = request.type === "approval"
    ? `/owner ${request.id} 通过 或 /owner ${request.id} 拒绝`
    : `/owner ${request.id} 回复 你的回复内容`;
  return {
    config: { wide_screen_mode: true },
    header: { template: request.type === "approval" ? "orange" : "blue", title: { tag: "plain_text", content: `${bot.name} 请求人工${request.type === "approval" ? "授权" : "协助"}` } },
    elements: [
      { tag: "markdown", content: `**请求编号：** ${request.id}\n\n${request.summary}` },
      { tag: "hr" },
      { tag: "markdown", content: `请直接回复机器人：\n\`${actionHint}\`` }
    ]
  };
}

export async function addEscalation(bot: BotConfig, request: EscalationRequest, message: LarkMessage): Promise<PendingEscalation> {
  const pending = await readPending(bot);
  const value: PendingEscalation = { ...request, messageId: message.messageId, senderId: message.senderId, createdAt: new Date().toISOString() };
  pending[value.id] = value;
  await writePending(bot, pending);
  return value;
}

export async function getEscalation(bot: BotConfig, id: string): Promise<PendingEscalation | null> {
  const pending = await readPending(bot);
  return pending[id] ?? null;
}

export async function completeEscalation(bot: BotConfig, id: string): Promise<void> {
  const pending = await readPending(bot);
  delete pending[id];
  await writePending(bot, pending);
}

async function readPending(bot: BotConfig): Promise<Record<string, PendingEscalation>> {
  try {
    return JSON.parse(await readFile(pendingPath(bot), "utf8")) as Record<string, PendingEscalation>;
  } catch {
    return {};
  }
}

async function writePending(bot: BotConfig, pending: Record<string, PendingEscalation>): Promise<void> {
  await mkdir(path.dirname(pendingPath(bot)), { recursive: true });
  await writeFile(pendingPath(bot), `${JSON.stringify(pending, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function pendingPath(bot: BotConfig): string {
  return path.join(stateRoot(), "bots", bot.id, "owner-escalations.json");
}
