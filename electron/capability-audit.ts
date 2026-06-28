import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { AppConfig, CapabilityAuditRecord, CapabilityAuditReport, CapabilityAuditSummary, CapabilityKind } from "./types.js";

const MAX_AUDIT_RECORDS_PER_BOT = 1000;

export async function appendCapabilityAudit(record: CapabilityAuditRecord): Promise<void> {
  const target = auditPath(record.botId);
  await mkdir(path.dirname(target), { recursive: true });
  const records = [...await readBotAudit(record.botId), record].slice(-MAX_AUDIT_RECORDS_PER_BOT);
  await writeFile(target, records.map((item) => JSON.stringify(item)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
}

export async function capabilityAuditReport(config: AppConfig, limit = 100): Promise<CapabilityAuditReport> {
  const records = (await Promise.all(config.bots.map((bot) => readBotAudit(bot.id))))
    .flat()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const summaries = new Map<string, CapabilityAuditSummary>();
  for (const record of records) {
    const key = `${record.botId}:${record.capability.kind}:${record.capability.id}:${record.trigger}`;
    const summary = summaries.get(key) ?? {
      botId: record.botId,
      botName: config.bots.find((bot) => bot.id === record.botId)?.name ?? record.botId,
      capability: record.capability,
      trigger: record.trigger,
      total: 0,
      success: 0,
      failed: 0,
      blocked: 0,
      approvalRequired: 0,
      lastStatus: record.status,
      lastAt: record.at
    };
    summary.total += 1;
    if (record.status === "success") summary.success += 1;
    else if (record.status === "failed") summary.failed += 1;
    else if (record.status === "blocked") summary.blocked += 1;
    else summary.approvalRequired += 1;
    if (Date.parse(record.at) >= Date.parse(summary.lastAt)) {
      summary.lastAt = record.at;
      summary.lastStatus = record.status;
    }
    summaries.set(key, summary);
  }
  return {
    summaries: [...summaries.values()].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)),
    recent: records.slice(0, limit)
  };
}

export function auditCapability(kind: CapabilityKind, id: string, name?: string): CapabilityAuditRecord["capability"] {
  return { kind, id, name };
}

async function readBotAudit(botId: string): Promise<CapabilityAuditRecord[]> {
  try {
    return (await readFile(auditPath(botId), "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapabilityAuditRecord)
      .filter((record) => recordValue(record));
  } catch {
    return [];
  }
}

function recordValue(record: CapabilityAuditRecord): boolean {
  return Boolean(
    record &&
    typeof record.at === "string" &&
    typeof record.botId === "string" &&
    ["agent", "command", "scheduled"].includes(record.trigger) &&
    ["success", "failed", "blocked", "approval-required"].includes(record.status) &&
    record.capability &&
    typeof record.capability.kind === "string" &&
    typeof record.capability.id === "string"
  );
}

function auditPath(botId: string): string {
  return path.join(stateRoot(), "bots", botId, "capability-audit.jsonl");
}
