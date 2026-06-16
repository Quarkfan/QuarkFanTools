import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";
import type { BotConfig, LarkMessage } from "./types.js";
import type { DeferredTaskRequest } from "./deferred-task-protocol.js";

export { continueTaskId, parseDeferredTask } from "./deferred-task-protocol.js";

export interface DeferredTask extends DeferredTaskRequest {
  id: string;
  botId: string;
  conversationKey: string;
  messageId: string;
  createdAt: string;
  status: "waiting-confirmation" | "scheduled" | "completed";
}

export async function addDeferredTask(bot: BotConfig, request: DeferredTaskRequest, message: LarkMessage, conversationKey: string): Promise<DeferredTask> {
  const tasks = await readTasks(bot);
  const task: DeferredTask = {
    ...request,
    id: randomUUID().slice(0, 8),
    botId: bot.id,
    conversationKey,
    messageId: message.messageId,
    createdAt: new Date().toISOString(),
    status: "waiting-confirmation"
  };
  tasks[task.id] = task;
  await writeTasks(bot, tasks);
  return task;
}

export async function getDeferredTask(bot: BotConfig, id: string): Promise<DeferredTask | null> {
  return (await readTasks(bot))[id] ?? null;
}

export async function updateDeferredTask(bot: BotConfig, task: DeferredTask): Promise<void> {
  const tasks = await readTasks(bot);
  tasks[task.id] = task;
  await writeTasks(bot, tasks);
}

async function readTasks(bot: BotConfig): Promise<Record<string, DeferredTask>> {
  try {
    return JSON.parse(await readFile(tasksPath(bot), "utf8")) as Record<string, DeferredTask>;
  } catch {
    return {};
  }
}

async function writeTasks(bot: BotConfig, tasks: Record<string, DeferredTask>): Promise<void> {
  await mkdir(path.dirname(tasksPath(bot)), { recursive: true });
  await writeFile(tasksPath(bot), `${JSON.stringify(tasks, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function tasksPath(bot: BotConfig): string {
  return path.join(stateRoot(), "bots", bot.id, "deferred-tasks.json");
}
