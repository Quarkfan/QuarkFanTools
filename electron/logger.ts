import { EventEmitter } from "node:events";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { LogEntry } from "./types.js";

export class Logger extends EventEmitter {
  private entries: LogEntry[] = [];

  list(): LogEntry[] {
    return [...this.entries];
  }

  record(entry: LogEntry): void {
    this.entries = [...this.entries.slice(-499), entry];
    this.emit("entry", entry);
  }

  async write(level: LogEntry["level"], message: string, detail?: string, botId?: string): Promise<void> {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      level,
      message,
      detail,
      botId
    };
    this.record(entry);
    const logDir = path.join(stateRoot(), "logs");
    await mkdir(logDir, { recursive: true });
    await appendFile(path.join(logDir, "quarkfantools.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  }
}
