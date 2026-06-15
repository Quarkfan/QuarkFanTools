import assert from "node:assert/strict";
import test from "node:test";
import { ownerDecision, parseEscalation } from "../escalation-protocol.js";
import type { LarkMessage } from "../types.js";

function message(text: string): LarkMessage {
  return {
    eventId: "evt",
    messageId: "om",
    chatId: "oc",
    chatType: "p2p",
    senderId: "ou_owner",
    messageType: "text",
    text,
    resources: [],
    receivedAt: new Date().toISOString(),
    raw: {}
  };
}

test("parses a structured owner escalation", () => {
  const request = parseEscalation('OWNER_ESCALATION: {"type":"approval","summary":"需要批准退款"}');
  assert.equal(request?.type, "approval");
  assert.equal(request?.summary, "需要批准退款");
  assert.ok(request?.id);
});

test("parses owner decisions", () => {
  assert.deepEqual(ownerDecision(message("/owner abc123 通过")), { id: "abc123", response: "Owner 已通过该授权请求。" });
  assert.deepEqual(ownerDecision(message("/owner abc123 回复 请联系运营同事")), { id: "abc123", response: "请联系运营同事" });
});
