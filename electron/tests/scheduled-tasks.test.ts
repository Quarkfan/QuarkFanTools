import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { dueScheduledTasks, isValidCronExpression, nextTaskRun, refreshBotScheduledTasks } from "../scheduled-task-core.js";
import { hydrateBotScheduledTasks, persistBotScheduledTasks } from "../scheduled-tasks.js";
import type { BotConfig, ScheduledTask } from "../types.js";

const baseTask: ScheduledTask = {
  id: "task-1",
  botId: "bot-1",
  enabled: true,
  name: "日报",
  schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "09:30" },
  target: { type: "agent", prompt: "生成日报" },
  delivery: { type: "chat", chatId: "oc_123" }
};

test("computes next interval run", () => {
  const next = nextTaskRun({
    ...baseTask,
    schedule: { type: "interval", timezone: "Asia/Shanghai", everyMinutes: 30 }
  }, new Date("2026-06-16T01:00:00.000Z"));
  assert.equal(next, "2026-06-16T01:30:00.000Z");
});

test("computes next cron run with timezone", () => {
  const next = nextTaskRun({
    ...baseTask,
    schedule: { type: "cron", timezone: "Asia/Shanghai", cronExpression: "15 9 * * 1-5" }
  }, new Date("2026-06-16T00:00:00.000Z"));
  assert.equal(next, "2026-06-16T01:15:00.000Z");
});

test("prefers scheduled retry time", () => {
  const next = nextTaskRun({
    ...baseTask,
    retryAt: "2026-06-16T00:10:00.000Z"
  }, new Date("2026-06-16T00:00:00.000Z"));
  assert.equal(next, "2026-06-16T00:10:00.000Z");
});

test("paused scheduled task has no automatic next run", () => {
  const next = nextTaskRun({
    ...baseTask,
    pausedReason: "连续失败 4 次，已超过最大重试次数 3"
  }, new Date("2026-06-16T00:00:00.000Z"));
  assert.equal(next, undefined);
});

test("validates cron expression syntax", () => {
  assert.equal(isValidCronExpression("*/30 8-20 * * *"), true);
  assert.equal(isValidCronExpression("15 9 * * 1-5"), true);
  assert.equal(isValidCronExpression("60 9 * * *"), false);
  assert.equal(isValidCronExpression("15 9 *"), false);
});

test("refreshes bot task nextRunAt and finds due tasks", () => {
  const bot: BotConfig = {
    id: "bot-1",
    name: "Bot 1",
    enabled: true,
    cliPath: "",
    profile: "",
    appId: "cli_test",
    appSecret: "secret",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    oauthScopes: [],
    skillNames: [],
    capabilityRefs: [],
    commandBindings: [],
    scheduledTasks: [{ ...baseTask, nextRunAt: "2026-06-16T01:00:00.000Z" }],
    pendingReaction: "OnIt",
    ownerOpenId: "",
    showProgress: false
  };
  const refreshed = refreshBotScheduledTasks(bot, new Date("2026-06-16T00:00:00.000Z"));
  assert.ok(refreshed[0]?.nextRunAt);
  assert.equal(dueScheduledTasks({ ...bot, scheduledTasks: refreshed }, new Date(refreshed[0].nextRunAt!)).length, 1);
});

test("hydrates runtime state from legacy scheduled task state file", async () => {
  await withTempProject(async () => {
    const bot = testBot([
      {
        ...baseTask,
        id: "cron-task",
        schedule: { type: "cron", timezone: "Asia/Shanghai", cronExpression: "15 9 * * 1-5" },
        retry: { maxRetries: 3, delayMinutes: 15 }
      },
      {
        ...baseTask,
        id: "retry-task",
        name: "重试任务",
        retry: { maxRetries: 2, delayMinutes: 10 }
      }
    ]);
    await mkdir(path.join("state", "bots", bot.id), { recursive: true });
    await writeFile(path.join("state", "bots", bot.id, "scheduled-tasks.json"), JSON.stringify([
      {
        id: "cron-task",
        botId: bot.id,
        enabled: true,
        name: "1.8 cron legacy shape",
        schedule: { type: "cron", timezone: "Asia/Shanghai", cronExpression: "*/30 8-20 * * *" },
        target: { type: "agent", prompt: "旧定义不应覆盖当前定义" },
        delivery: { type: "chat", chatId: "oc_legacy" },
        lastRunAt: "2026-06-16T01:15:00.000Z",
        nextRunAt: "2026-06-17T01:15:00.000Z",
        lastStatus: "success"
      },
      {
        id: "retry-task",
        failureCount: 2,
        retryAt: "2026-06-16T02:15:00.000Z",
        pausedReason: "等待人工处理"
      },
      {
        id: "removed-task",
        failureCount: 9,
        retryAt: "2026-06-16T03:15:00.000Z"
      }
    ], null, 2));

    await hydrateBotScheduledTasks(bot);

    assert.equal(bot.scheduledTasks?.[0]?.schedule.type, "cron");
    assert.equal(bot.scheduledTasks?.[0]?.schedule.cronExpression, "15 9 * * 1-5");
    assert.equal(bot.scheduledTasks?.[0]?.delivery.chatId, "oc_123");
    assert.equal(bot.scheduledTasks?.[0]?.lastStatus, "success");
    assert.equal(bot.scheduledTasks?.[1]?.failureCount, 2);
    assert.equal(bot.scheduledTasks?.[1]?.retryAt, "2026-06-16T02:15:00.000Z");
    assert.equal(bot.scheduledTasks?.[1]?.pausedReason, "等待人工处理");
    assert.equal(bot.scheduledTasks?.length, 2);
  });
});

test("persists only scheduled task runtime state", async () => {
  await withTempProject(async () => {
    const bot = testBot([{
      ...baseTask,
      id: "retry-task",
      retry: { maxRetries: 3, delayMinutes: 15 },
      lastRunAt: "2026-06-16T01:00:00.000Z",
      nextRunAt: "2026-06-16T02:15:00.000Z",
      lastStatus: "failed",
      failureCount: 2,
      retryAt: "2026-06-16T02:15:00.000Z",
      pausedReason: "等待人工处理"
    }]);

    await persistBotScheduledTasks(bot);
    const content = await readFile(path.join("state", "bots", bot.id, "scheduled-tasks.json"), "utf8");
    const records = JSON.parse(content) as Array<Record<string, unknown>>;

    assert.deepEqual(records, [{
      id: "retry-task",
      lastRunAt: "2026-06-16T01:00:00.000Z",
      nextRunAt: "2026-06-16T02:15:00.000Z",
      lastStatus: "failed",
      failureCount: 2,
      retryAt: "2026-06-16T02:15:00.000Z",
      pausedReason: "等待人工处理"
    }]);
    assert.equal("schedule" in records[0], false);
    assert.equal("target" in records[0], false);
    assert.equal("delivery" in records[0], false);
  });
});

function testBot(scheduledTasks: ScheduledTask[]): BotConfig {
  return {
    id: "bot-1",
    name: "Bot 1",
    enabled: true,
    cliPath: "",
    profile: "",
    appId: "cli_test",
    appSecret: "secret",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    oauthScopes: [],
    skillNames: [],
    capabilityRefs: [],
    commandBindings: [],
    scheduledTasks,
    pendingReaction: "OnIt",
    ownerOpenId: "",
    showProgress: false
  };
}

async function withTempProject(run: () => Promise<void>): Promise<void> {
  const previous = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), "qft-scheduled-tasks-"));
  try {
    process.chdir(root);
    await run();
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
}
