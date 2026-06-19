import assert from "node:assert/strict";
import test from "node:test";
import { dueScheduledTasks, nextTaskRun, refreshBotScheduledTasks } from "../scheduled-task-core.js";
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
