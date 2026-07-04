import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { appInfo } from "./release-notes.js";
import { capabilityAuditReport } from "./capability-audit.js";
import { mcpServerDiagnostics } from "./mcp-diagnostics.js";
import { platformConnectorDiagnostics } from "./platform-diagnostics.js";
import { scheduledTaskRunHistory } from "./scheduled-tasks.js";
import { storageStats } from "./storage.js";
import { stateRoot } from "./paths.js";
import type { AppConfig, LogEntry, RuntimeSnapshot } from "./types.js";

interface DiagnosticsBundleOptions {
  snapshot: RuntimeSnapshot;
  logs: LogEntry[];
  appVersion: string;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

const SENSITIVE_KEY_RE = /(secret|token|api[_-]?key|password|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key)/i;
const crcTable = makeCrcTable();

export async function exportDiagnosticsBundle(options: DiagnosticsBundleOptions, targetPath: string): Promise<void> {
  const entries = await diagnosticsEntries(options);
  await writeFile(targetPath, createZipBuffer(entries), { mode: 0o600 });
}

export async function diagnosticsEntries({ snapshot, logs, appVersion }: DiagnosticsBundleOptions): Promise<ZipEntry[]> {
  const config = redactDiagnosticsValue(snapshot.config) as AppConfig;
  const [stats, scheduledRuns, mcpDiagnostics, platformDiagnostics, capabilityAudit] = await Promise.all([
    storageStats(snapshot.config),
    scheduledTaskRunHistory(snapshot.config),
    mcpServerDiagnostics(snapshot.config, { probeProtocol: false }),
    Promise.resolve(platformConnectorDiagnostics(snapshot.config)),
    capabilityAuditReport(snapshot.config)
  ]);
  const logPath = path.join(stateRoot(), "logs", "quarkfantools.jsonl");
  const persistedLogs = await readTextIfSmall(logPath, 5 * 1024 * 1024);
  return [
    textEntry("README.txt", [
      "QuarkfanTools diagnostics bundle.",
      "",
      "This package is intended for support troubleshooting.",
      "It redacts known credentials and tokens from config snapshots.",
      "Runtime logs may still contain user-provided message text, file names, chat ids, or error details.",
      "Please review before sharing if the customer environment has strict data handling requirements.",
      ""
    ].join("\n")),
    jsonEntry("summary.json", {
      generatedAt: new Date().toISOString(),
      app: appInfo(appVersion),
      runningBotIds: snapshot.runningBotIds,
      connectedBotIds: snapshot.connectedBotIds,
      activeTasks: snapshot.activeTasks,
      queuedTasks: snapshot.queuedTasks,
      bots: snapshot.config.bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        enabled: bot.enabled,
        provider: bot.provider ?? "lark",
        skillCount: bot.skillNames.length,
        capabilityRefCount: bot.capabilityRefs?.length ?? 0,
        commandCount: bot.commandBindings?.length ?? 0,
        scheduledTaskCount: bot.scheduledTasks?.length ?? 0
      }))
    }),
    jsonEntry("config.redacted.json", config),
    jsonEntry("snapshot.redacted.json", redactDiagnosticsValue(snapshot)),
    jsonEntry("runtime-logs.memory.json", redactDiagnosticsValue(logs)),
    textEntry("runtime-logs.persisted.jsonl", persistedLogs || "No persisted log file found or file is too large.\n"),
    jsonEntry("storage-stats.redacted.json", redactDiagnosticsValue(stats)),
    jsonEntry("scheduled-runs.redacted.json", redactDiagnosticsValue(scheduledRuns)),
    jsonEntry("mcp-diagnostics.redacted.json", redactDiagnosticsValue(mcpDiagnostics)),
    jsonEntry("platform-diagnostics.redacted.json", redactDiagnosticsValue(platformDiagnostics)),
    jsonEntry("capability-audit.redacted.json", redactDiagnosticsValue(capabilityAudit))
  ];
}

export function redactDiagnosticsValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticsValue(item));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      result[key] = item ? "[REDACTED]" : item;
    } else {
      result[key] = redactDiagnosticsValue(item);
    }
  }
  return result;
}

export function createZipBuffer(entries: ZipEntry[]): Buffer {
  const fileRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(safeZipEntryName(entry.name), "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    fileRecords.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  const central = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...fileRecords, central, end]);
}

function jsonEntry(name: string, value: unknown): ZipEntry {
  return textEntry(name, `${JSON.stringify(value, null, 2)}\n`);
}

function textEntry(name: string, value: string): ZipEntry {
  return { name, data: Buffer.from(value, "utf8") };
}

async function readTextIfSmall(filePath: string, maxBytes: number): Promise<string> {
  try {
    const info = await stat(filePath);
    if (info.size > maxBytes) return "";
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function safeZipEntryName(name: string): string {
  return name.replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
}

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
