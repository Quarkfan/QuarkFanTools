import assert from "node:assert/strict";
import test from "node:test";
import { TaskLimiter } from "../task-limiter.js";

test("limits concurrent tasks and hands a released slot to the queue", async () => {
  const limiter = new TaskLimiter();
  const releaseFirst = await limiter.acquire(1);
  const second = limiter.acquire(1);
  assert.equal(limiter.active, 1);
  assert.equal(limiter.queued, 1);

  releaseFirst();
  const releaseSecond = await second;
  assert.equal(limiter.active, 1);
  assert.equal(limiter.queued, 0);

  releaseSecond();
  assert.equal(limiter.active, 0);
});
