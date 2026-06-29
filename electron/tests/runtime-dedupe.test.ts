import assert from "node:assert/strict";
import test from "node:test";
import { hasProcessedMessage, markProcessedMessage, processedKeysForMessage } from "../runtime-dedupe.js";

test("dedupes repeated deliveries by message id even when event id changes", () => {
  const processed = new Set<string>();
  markProcessedMessage(processed, { eventId: "evt-first", messageId: "om-shared" });

  assert.deepEqual(processedKeysForMessage({ eventId: "evt-first", messageId: "om-shared" }), [
    "event:evt-first",
    "message:om-shared"
  ]);
  assert.equal(hasProcessedMessage(processed, { eventId: "evt-retry", messageId: "om-shared" }), true);
  assert.equal(hasProcessedMessage(processed, { eventId: "evt-new", messageId: "om-new" }), false);
});

test("keeps compatibility with legacy processed event ids", () => {
  const processed = new Set<string>(["evt-legacy", "om-legacy"]);

  assert.equal(hasProcessedMessage(processed, { eventId: "evt-legacy", messageId: "om-new" }), true);
  assert.equal(hasProcessedMessage(processed, { eventId: "evt-new", messageId: "om-legacy" }), true);
});
