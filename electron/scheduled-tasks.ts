import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import { dueScheduledTasks, nextTaskRun, refreshBotScheduledTasks } from "./scheduled-task-core.js";
import type { AppConfig, BotConfig, ScheduledTaskRuntimeState, ScheduledTaskRunSummary } from "./types.js";

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

export async function loadBotScheduledTaskStates(botId: string): Promise<ScheduledTaskRuntimeState[]> {
  try {
    const content = await readFile(path.join(stateRoot(), "bots", botId, "scheduled-tasks.json"), "utf8");
    const parsed = JSON.parse(content) as unknown;
    let values: unknown[] = [];
    if (Array.isArray(parsed)) {
      values = parsed;
    } else if (parsed && typeof parsed === "object") {
      const tasks = (parsed as Record<string, unknown>).tasks;
      if (Array.isArray(tasks)) values = tasks;
    }
    return normalizeScheduledTaskStates(values);
  } catch {
    return [];
  }
}

export function mergeScheduledTaskStates(bot: BotConfig, states: ScheduledTaskRuntimeState[]): BotConfig["scheduledTasks"] {
  const byId = new Map(states.map((state) => [state.id, state]));
  return (bot.scheduledTasks ?? []).map((task) => {
    const state = byId.get(task.id);
    if (!state) return task;
    return {
      ...task,
      lastRunAt: state.lastRunAt,
      nextRunAt: state.nextRunAt,
      lastStatus: state.lastStatus,
      failureCount: state.failureCount,
      retryAt: state.retryAt,
      pausedReason: state.pausedReason
    };
  });
}

export async function hydrateBotScheduledTasks(bot: BotConfig): Promise<void> {
  bot.scheduledTasks = mergeScheduledTaskStates(bot, await loadBotScheduledTaskStates(bot.id));
}

export async function persistBotScheduledTasks(bot: BotConfig): Promise<void> {
  const root = path.join(stateRoot(), "bots", bot.id);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "scheduled-tasks.json"), `${JSON.stringify(scheduledTaskStates(bot), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function scheduledTaskStates(bot: BotConfig): ScheduledTaskRuntimeState[] {
  return (bot.scheduledTasks ?? [])
    .map((task) => normalizeScheduledTaskState(task))
    .filter((state): state is ScheduledTaskRuntimeState => Boolean(state));
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

function normalizeScheduledTaskStates(values: unknown[]): ScheduledTaskRuntimeState[] {
  const seen = new Set<string>();
  const result: ScheduledTaskRuntimeState[] = [];
  for (const value of values) {
    const state = normalizeScheduledTaskState(value);
    if (!state || seen.has(state.id)) continue;
    seen.add(state.id);
    result.push(state);
  }
  return result;
}

function normalizeScheduledTaskState(value: unknown): ScheduledTaskRuntimeState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id ?? "").trim();
  if (!id) return null;
  const state: ScheduledTaskRuntimeState = { id };
  if (typeof record.lastRunAt === "string" && record.lastRunAt.trim()) state.lastRunAt = record.lastRunAt.trim();
  if (typeof record.nextRunAt === "string" && record.nextRunAt.trim()) state.nextRunAt = record.nextRunAt.trim();
  if (["success", "failed", "skipped"].includes(String(record.lastStatus ?? ""))) {
    state.lastStatus = String(record.lastStatus) as ScheduledTaskRuntimeState["lastStatus"];
  }
  const failureCount = Math.max(0, Math.floor(Number(record.failureCount ?? 0) || 0));
  if (failureCount > 0) state.failureCount = failureCount;
  if (typeof record.retryAt === "string" && record.retryAt.trim()) state.retryAt = record.retryAt.trim();
  if (typeof record.pausedReason === "string" && record.pausedReason.trim()) state.pausedReason = record.pausedReason.trim();
  return state;
}

export { dueScheduledTasks, nextTaskRun, refreshBotScheduledTasks };
