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
  const type = trigger.type === "once" ? "once" : trigger.type === "cron" ? "cron" : "interval";
  const intervalMinutes = Math.max(1, Math.min(10080, Math.floor(Number(trigger.intervalMinutes ?? 60) || 60)));
  const cronExpression = String(trigger.cronExpression ?? "15 9 * * 1-5").trim().replace(/\s+/g, " ");
  const task: ScheduledTask = {
    id: String(value.id || randomUUID()),
    name: String(value.name || "未命名定时任务").trim() || "未命名定时任务",
    enabled: Boolean(value.enabled),
    trigger: {
      type,
      intervalMinutes,
      runAt: validIsoDate(trigger.runAt) ?? undefined,
      cronExpression: isValidCronExpression(cronExpression) ? cronExpression : "15 9 * * 1-5",
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
  if (task.trigger.type === "cron") {
    return nextCronRunAt(task, from) ?? new Date(from.getTime() + 60 * 60_000);
  }
  return new Date(from.getTime() + (task.trigger.intervalMinutes ?? 60) * 60_000);
}

export function isValidCronExpression(expression: string): boolean {
  return parseCronExpression(expression) !== null;
}

function nextCronRunAt(task: ScheduledTask, from: Date): Date | null {
  const cron = parseCronExpression(task.trigger.cronExpression ?? "");
  if (!cron) return null;
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  const limitMinutes = 366 * 24 * 60;
  for (let index = 0; index < limitMinutes; index += 1) {
    const candidate = new Date(cursor.getTime() + index * 60_000);
    if (matchesCron(cron, wallClockParts(candidate, task.trigger.timezone))) return candidate;
  }
  return null;
}

interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

function parseCronExpression(expression: string): ParsedCron | null {
  const parts = expression.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length !== 5) return null;
  const minute = parseCronField(parts[0], 0, 59);
  const hour = parseCronField(parts[1], 0, 23);
  const dayOfMonth = parseCronField(parts[2], 1, 31);
  const month = parseCronField(parts[3], 1, 12);
  const dayOfWeek = parseCronField(parts[4], 0, 7, 0);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function parseCronField(raw: string, min: number, max: number, normalizeSevenToZero?: number): CronField | null {
  const values = new Set<number>();
  const wildcard = raw === "*" || raw.startsWith("*/");
  for (const part of raw.split(",")) {
    const match = part.match(/^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/);
    if (!match) return null;
    const step = match[2] ? Number(match[2]) : 1;
    if (!Number.isInteger(step) || step < 1) return null;
    const range = match[1];
    let start = min;
    let end = max;
    if (range !== "*") {
      const [rawStart, rawEnd] = range.split("-");
      start = Number(rawStart);
      end = rawEnd === undefined ? start : Number(rawEnd);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return null;
    }
    if (start < min || end > max) return null;
    for (let value = start; value <= end; value += step) {
      values.add(normalizeSevenToZero !== undefined && value === 7 ? normalizeSevenToZero : value);
    }
  }
  if (values.size === 0) return null;
  return { values, wildcard };
}

function matchesCron(cron: ParsedCron, parts: ReturnType<typeof wallClockParts>): boolean {
  const dayOfMonthMatches = cron.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatches = cron.dayOfWeek.values.has(parts.weekday);
  const dayMatches = cron.dayOfMonth.wildcard || cron.dayOfWeek.wildcard
    ? dayOfMonthMatches && dayOfWeekMatches
    : dayOfMonthMatches || dayOfWeekMatches;
  return cron.minute.values.has(parts.minute)
    && cron.hour.values.has(parts.hour)
    && cron.month.values.has(parts.month)
    && dayMatches;
}

function wallClockParts(when: Date, timezone: string): { weekday: number; minute: number; hour: number; day: number; month: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    hourCycle: "h23",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const pieces = Object.fromEntries(formatter.formatToParts(when).map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[pieces.weekday ?? "Sun"] ?? 0,
    minute: Number(pieces.minute ?? 0),
    hour: Number(pieces.hour ?? 0),
    day: Number(pieces.day ?? 1),
    month: Number(pieces.month ?? 1)
  };
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
