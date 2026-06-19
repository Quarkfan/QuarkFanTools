import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { BotConfig, SessionTranscriptTurn } from "./types.js";

const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

interface SessionRecord {
  sessionId: string;
  updatedAt: string;
  messageIds?: string[];
  transcript?: SessionTranscriptTurn[];
}

export class SessionStore {
  private records = new Map<string, Map<string, SessionRecord>>();

  async load(bot: BotConfig): Promise<void> {
    try {
      const values = JSON.parse(await readFile(sessionPath(bot.id), "utf8")) as Record<string, SessionRecord>;
      this.records.set(bot.id, new Map(Object.entries(values)));
    } catch {
      this.records.set(bot.id, new Map());
    }
  }

  get(bot: BotConfig, key: string): string | undefined {
    const record = this.records.get(bot.id)?.get(key);
    if (!record) return undefined;
    if (Date.now() - Date.parse(record.updatedAt) <= SESSION_IDLE_MS) return record.sessionId;
    this.records.get(bot.id)?.delete(key);
    return undefined;
  }

  async set(bot: BotConfig, key: string, sessionId: string, messageId: string, turn?: Omit<SessionTranscriptTurn, "time" | "messageId">): Promise<void> {
    const records = this.records.get(bot.id) ?? new Map<string, SessionRecord>();
    const previous = records.get(key);
    records.set(key, {
      sessionId,
      updatedAt: new Date().toISOString(),
      messageIds: [...new Set([...(previous?.messageIds ?? []), messageId])].slice(-100),
      transcript: turn
        ? [...(previous?.transcript ?? []), {
            time: new Date().toISOString(),
            messageId,
            user: turn.user,
            assistant: turn.assistant,
            events: turn.events?.slice(-80)
          }].slice(-50)
        : previous?.transcript
    });
    this.records.set(bot.id, records);
    await this.save(bot);
  }

  async clear(bot: BotConfig, key: string): Promise<void> {
    this.records.get(bot.id)?.delete(key);
    await this.save(bot);
  }

  private async save(bot: BotConfig): Promise<void> {
    const target = sessionPath(bot.id);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(Object.fromEntries(this.records.get(bot.id) ?? []), null, 2)}\n`, "utf8");
  }
}

function sessionPath(botId: string): string {
  return path.join(stateRoot(), "bots", botId, "sessions.json");
}
