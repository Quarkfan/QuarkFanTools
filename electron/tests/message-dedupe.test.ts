import assert from "node:assert/strict";
import test from "node:test";
import { hasProcessedMessage, markProcessedMessage, processedMessageKeys } from "../message-dedupe.js";

test("message dedupe uses stable message id across different event ids", () => {
  const processed = new Set<string>();
  markProcessedMessage(processed, { eventId: "evt_first", messageId: "om_same" });

  assert.ok(hasProcessedMessage(processed, { eventId: "evt_second", messageId: "om_same" }));
  assert.equal(hasProcessedMessage(processed, { eventId: "evt_second", messageId: "om_other" }), false);
});

test("message dedupe keeps legacy event id compatibility", () => {
  const processed = new Set<string>(["evt_legacy"]);

  assert.ok(hasProcessedMessage(processed, { eventId: "evt_legacy", messageId: "om_new" }));
  assert.deepEqual(processedMessageKeys({ eventId: "evt_1", messageId: "om_1" }), [
    "evt_1",
    "event:evt_1",
    "message:om_1"
  ]);
});
