import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import { dueScheduledTasks, nextTaskRun, refreshBotScheduledTasks } from "./scheduled-task-core.js";
import type { AppConfig, BotConfig, ScheduledTask, ScheduledTaskRunSummary } from "./types.js";

export interface ScheduledTaskRunRecord {
  taskId: string;
  botId: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed" | "skipped";
  detail?: string;
}

export async function appendScheduledTaskRun(record: ScheduledTaskRunRecord): Promise<void> {
  const root = path.join(stateRoot(), "bots", record.botId);
  await mkdir(root, { recursive: true });
  await appendFile(path.join(root, "scheduled-runs.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}

export async function persistBotScheduledTasks(bot: BotConfig): Promise<void> {
  const root = path.join(stateRoot(), "bots", bot.id);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "scheduled-tasks.json"), `${JSON.stringify(bot.scheduledTasks ?? [], null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function scheduledTaskRunHistory(config: AppConfig, limit = 100): Promise<ScheduledTaskRunSummary[]> {
  const runs: ScheduledTaskRunSummary[] = [];
  for (const bot of config.bots) {
    const filePath = path.join(stateRoot(), "bots", bot.id, "scheduled-runs.jsonl");
    let content = "";
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const record = scheduledTaskRunRecordValue(line);
      if (!record) continue;
      const task = bot.scheduledTasks?.find((item) => item.id === record.taskId);
      runs.push({
        ...record,
        taskName: task?.name || record.taskId,
        botName: bot.name || bot.id
      });
    }
  }
  return runs
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, Math.max(1, limit));
}

function scheduledTaskRunRecordValue(line: string): Omit<ScheduledTaskRunSummary, "taskName" | "botName"> | null {
  try {
    const value = JSON.parse(line) as Partial<ScheduledTaskRunRecord>;
    if (!value.taskId || !value.botId || !value.startedAt || !value.finishedAt) return null;
    if (!["success", "failed", "skipped"].includes(String(value.status))) return null;
    return {
      taskId: String(value.taskId),
      botId: String(value.botId),
      startedAt: String(value.startedAt),
      finishedAt: String(value.finishedAt),
      status: value.status as ScheduledTaskRunRecord["status"],
      detail: typeof value.detail === "string" ? value.detail : undefined
    };
  } catch {
    return null;
  }
}
export { dueScheduledTasks, nextTaskRun, refreshBotScheduledTasks };
