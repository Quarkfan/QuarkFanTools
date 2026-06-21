import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { BotConfig, ScheduledTask } from "./types.js";

const SCHEDULER_TICK_MS = 30_000;

export function scheduledTasksPath(botId: string): string {
  return path.join(stateRoot(), "bots", botId, "scheduled-tasks.json");
}

export function newScheduledTask(name = "新定时任务"): ScheduledTask {
  const now = new Date();
  return normalizeScheduledTask({
    id: randomUUID(),
    name,
    enabled: false,
    trigger: {
      type: "interval",
      intervalMinutes: 60,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"
    },
    target: {
      type: "prompt",
      prompt: ""
    },
    output: {
      mode: "none"
    },
    policy: {
      timeoutSeconds: 1800,
      missed: "skip",
      concurrency: "skip-if-running"
    },
    state: {
      nextRunAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    }
  });
}

export async function loadScheduledTasks(bot: BotConfig): Promise<ScheduledTask[]> {
  const raw = await readFile(scheduledTasksPath(bot.id), "utf8").catch(() => "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];
  const tasks = parsed.map((task) => normalizeScheduledTask(task));
  return tasks.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveScheduledTasks(bot: BotConfig, tasks: ScheduledTask[]): Promise<ScheduledTask[]> {
  const normalized = tasks.map((task) => normalizeScheduledTask(task));
  await mkdir(path.dirname(scheduledTasksPath(bot.id)), { recursive: true });
  await writeFile(scheduledTasksPath(bot.id), `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return normalized;
}

export function normalizeScheduledTask(input: unknown): ScheduledTask {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const trigger = value.trigger && typeof value.trigger === "object" ? value.trigger as Record<string, unknown> : {};
  const target = value.target && typeof value.target === "object" ? value.target as Record<string, unknown> : {};
  const policy = value.policy && typeof value.policy === "object" ? value.policy as Record<string, unknown> : {};
  const state = value.state && typeof value.state === "object" ? value.state as Record<string, unknown> : {};
  const type = trigger.type === "once" ? "once" : "interval";
  const intervalMinutes = Math.max(1, Math.min(10080, Math.floor(Number(trigger.intervalMinutes ?? 60) || 60)));
  const task: ScheduledTask = {
    id: String(value.id || randomUUID()),
    name: String(value.name || "未命名定时任务").trim() || "未命名定时任务",
    enabled: Boolean(value.enabled),
    trigger: {
      type,
      intervalMinutes,
      runAt: validIsoDate(trigger.runAt) ?? undefined,
      timezone: String(trigger.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai")
    },
    target: {
      type: "prompt",
      prompt: String(target.prompt ?? "")
    },
    output: {
      mode: "none"
    },
    policy: {
      timeoutSeconds: Math.max(30, Math.min(86400, Math.floor(Number(policy.timeoutSeconds ?? 1800) || 1800))),
      missed: policy.missed === "run-once" ? "run-once" : "skip",
      concurrency: policy.concurrency === "queue" ? "queue" : "skip-if-running"
    },
    state: {
      lastRunAt: validIsoDate(state.lastRunAt) ?? undefined,
      nextRunAt: validIsoDate(state.nextRunAt) ?? undefined,
      lastStatus: state.lastStatus === "success" || state.lastStatus === "failed" || state.lastStatus === "skipped" ? state.lastStatus : undefined,
      lastError: state.lastError ? String(state.lastError).slice(0, 1000) : undefined
    }
  };
  if (task.enabled && !task.state.nextRunAt) {
    task.state.nextRunAt = nextRunAt(task, new Date()).toISOString();
  }
  return task;
}

export function nextRunAt(task: ScheduledTask, from: Date): Date {
  if (task.trigger.type === "once") {
    return task.trigger.runAt ? new Date(task.trigger.runAt) : from;
  }
  return new Date(from.getTime() + (task.trigger.intervalMinutes ?? 60) * 60_000);
}

export function isTaskDue(task: ScheduledTask, now = new Date()): boolean {
  if (!task.enabled || !task.state.nextRunAt) return false;
  const next = new Date(task.state.nextRunAt).getTime();
  return Number.isFinite(next) && next <= now.getTime();
}

function validIsoDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value);
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export class BotScheduler {
  private tasks: ScheduledTask[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();
  private queued = new Set<string>();

  constructor(private readonly onDue: (taskId: string) => Promise<void>) {}

  start(tasks: ScheduledTask[]): void {
    this.tasks = tasks;
    this.stop();
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    void this.tick();
  }

  reload(tasks: ScheduledTask[]): void {
    this.tasks = tasks;
    if (!this.timer) this.start(tasks);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.queued.clear();
  }

  triggerNow(taskId: string): void {
    void this.runTask(taskId);
  }

  private async tick(): Promise<void> {
    for (const task of this.tasks) {
      if (!isTaskDue(task)) continue;
      await this.runTask(task.id);
    }
  }

  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task || !task.enabled) return;
    if (this.running.has(task.id) && task.policy.concurrency === "skip-if-running") return;
    if (this.running.has(task.id) && task.policy.concurrency === "queue") {
      this.queued.add(task.id);
      return;
    }
    this.running.add(task.id);
    try {
      await this.onDue(task.id);
    } finally {
      this.running.delete(task.id);
      if (this.queued.delete(task.id)) void this.runTask(task.id);
    }
  }
}
