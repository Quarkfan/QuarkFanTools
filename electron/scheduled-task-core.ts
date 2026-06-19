import type { BotConfig, ScheduledTask } from "./types.js";

export function nextTaskRun(task: ScheduledTask, from = new Date()): string | undefined {
  if (!task.enabled) return undefined;
  if (task.schedule.type === "interval") {
    const minutes = task.schedule.everyMinutes ?? 60;
    return new Date(from.getTime() + minutes * 60_000).toISOString();
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
    nextRunAt: task.enabled ? nextTaskRun(task, from) : undefined
  }));
}

export function dueScheduledTasks(bot: BotConfig, now = new Date()): ScheduledTask[] {
  return (bot.scheduledTasks ?? []).filter((task) => task.enabled && task.nextRunAt && Date.parse(task.nextRunAt) <= now.getTime());
}

function matchesWallClock(task: ScheduledTask, when: Date): boolean {
  const parts = wallClockParts(when, task.schedule.timezone);
  if (task.schedule.type === "daily") {
    return parts.time === task.schedule.timeOfDay;
  }
  return parts.time === task.schedule.timeOfDay && Boolean(task.schedule.weekdays?.includes(parts.weekday));
}

function wallClockParts(when: Date, timezone: string): { time: string; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  const pieces = Object.fromEntries(formatter.formatToParts(when).map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    time: `${pieces.hour ?? "00"}:${pieces.minute ?? "00"}`,
    weekday: weekdayMap[pieces.weekday ?? "Sun"] ?? 0
  };
}
