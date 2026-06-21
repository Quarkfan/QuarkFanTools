import assert from "node:assert/strict";
import test from "node:test";
import { BotScheduler, isTaskDue, newScheduledTask, nextRunAt, normalizeScheduledTask } from "../scheduled-tasks.js";

test("creates a disabled interval scheduled task by default", () => {
  const task = newScheduledTask("Daily check");
  assert.equal(task.name, "Daily check");
  assert.equal(task.enabled, false);
  assert.equal(task.trigger.type, "interval");
  assert.equal(task.trigger.intervalMinutes, 60);
  assert.equal(task.target.type, "prompt");
  assert.equal(task.output.mode, "none");
  assert.equal(task.policy.concurrency, "skip-if-running");
});

test("normalizes once scheduled tasks and detects due state", () => {
  const runAt = new Date(Date.now() - 60_000).toISOString();
  const task = normalizeScheduledTask({
    id: "task-1",
    name: "Once",
    enabled: true,
    trigger: { type: "once", runAt },
    target: { prompt: "Run report" },
    output: { mode: "none" },
    policy: { timeoutSeconds: 5, missed: "run-once", concurrency: "queue" },
    state: { nextRunAt: runAt }
  });

  assert.equal(task.policy.timeoutSeconds, 30);
  assert.equal(task.policy.missed, "run-once");
  assert.equal(task.policy.concurrency, "queue");
  assert.equal(isTaskDue(task, new Date()), true);
});

test("computes next interval run from a given time", () => {
  const from = new Date("2026-06-21T00:00:00.000Z");
  const task = normalizeScheduledTask({
    enabled: true,
    trigger: { type: "interval", intervalMinutes: 15 },
    target: { prompt: "Ping" }
  });
  assert.equal(nextRunAt(task, from).toISOString(), "2026-06-21T00:15:00.000Z");
});

test("queues one follow-up run for an already running task", async () => {
  let releaseFirstRun!: () => void;
  let runCount = 0;
  const firstRun = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });
  const scheduler = new BotScheduler(async () => {
    runCount += 1;
    if (runCount === 1) await firstRun;
  });
  const task = normalizeScheduledTask({
    id: "task-queue",
    enabled: true,
    trigger: { type: "interval", intervalMinutes: 60 },
    target: { prompt: "Ping" },
    policy: { concurrency: "queue" },
    state: { nextRunAt: new Date(Date.now() + 60_000).toISOString() }
  });

  scheduler.reload([task]);
  scheduler.triggerNow(task.id);
  scheduler.triggerNow(task.id);
  scheduler.triggerNow(task.id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runCount, 1);
  releaseFirstRun();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runCount, 2);
  scheduler.stop();
});
