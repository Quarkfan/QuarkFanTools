import type { BotConfig, ScheduledTask } from "./types.js";

export function nextTaskRun(task: ScheduledTask, from = new Date()): string | undefined {
  if (!task.enabled) return undefined;
  if (task.pausedReason) return undefined;
  if (task.retryAt && Number.isFinite(Date.parse(task.retryAt))) return task.retryAt;
  if (task.schedule.type === "interval") {
    const minutes = task.schedule.everyMinutes ?? 60;
    return new Date(from.getTime() + minutes * 60_000).toISOString();
  }
  if (task.schedule.type === "cron") {
    return nextCronRun(task, from);
  }
  const limitMinutes = task.schedule.type === "daily" ? 2 * 24 * 60 : 8 * 24 * 60;
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  for (let index = 0; index < limitMinutes; index += 1) {
    const candidate = new Date(cursor.getTime() + index * 60_000);
    if (matchesWallClock(task, candidate)) return candidate.toISOString();
  }
  return undefined;
}

export function refreshBotScheduledTasks(bot: BotConfig, from = new Date()): ScheduledTask[] {
  return (bot.scheduledTasks ?? []).map((task) => ({
    ...task,
    botId: bot.id,
    nextRunAt: task.enabled ? refreshedNextRunAt(task, from) : undefined
  }));
}

export function dueScheduledTasks(bot: BotConfig, now = new Date()): ScheduledTask[] {
  return (bot.scheduledTasks ?? []).filter((task) => task.enabled && task.nextRunAt && Date.parse(task.nextRunAt) <= now.getTime());
}

export function isValidCronExpression(expression: string): boolean {
  return parseCronExpression(expression) !== null;
}

function refreshedNextRunAt(task: ScheduledTask, from: Date): string | undefined {
  if (task.pausedReason) return undefined;
  const currentNextRunAt = task.nextRunAt && Number.isFinite(Date.parse(task.nextRunAt))
    ? task.nextRunAt
    : undefined;
  if (currentNextRunAt && Date.parse(currentNextRunAt) <= from.getTime()) {
    return currentNextRunAt;
  }
  return nextTaskRun(task, from);
}

function matchesWallClock(task: ScheduledTask, when: Date): boolean {
  const parts = wallClockParts(when, task.schedule.timezone);
  if (task.schedule.type === "daily") {
    return parts.time === task.schedule.timeOfDay;
  }
  return parts.time === task.schedule.timeOfDay && Boolean(task.schedule.weekdays?.includes(parts.weekday));
}

function nextCronRun(task: ScheduledTask, from: Date): string | undefined {
  const cron = parseCronExpression(task.schedule.cronExpression ?? "");
  if (!cron) return undefined;
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  const limitMinutes = 366 * 24 * 60;
  for (let index = 0; index < limitMinutes; index += 1) {
    const candidate = new Date(cursor.getTime() + index * 60_000);
    if (matchesCron(cron, wallClockParts(candidate, task.schedule.timezone))) return candidate.toISOString();
  }
  return undefined;
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

function wallClockParts(when: Date, timezone: string): { time: string; weekday: number; minute: number; hour: number; day: number; month: number } {
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
    time: `${pieces.hour ?? "00"}:${pieces.minute ?? "00"}`,
    weekday: weekdayMap[pieces.weekday ?? "Sun"] ?? 0,
    minute: Number(pieces.minute ?? 0),
    hour: Number(pieces.hour ?? 0),
    day: Number(pieces.day ?? 1),
    month: Number(pieces.month ?? 1)
  };
}
