import assert from "node:assert/strict";
import test from "node:test";
import { conversationKey, workspaceSessionId } from "../conversation.js";
import type { LarkMessage } from "../types.js";

function message(overrides: Partial<LarkMessage>): LarkMessage {
  return {
    eventId: "evt",
    messageId: "om",
    chatId: "oc",
    chatType: "p2p",
    senderId: "ou",
    messageType: "text",
    text: "hello",
    resources: [],
    receivedAt: new Date().toISOString(),
    raw: {},
    ...overrides
  };
}

test("private chats share context by chat", () => {
  assert.equal(conversationKey(message({ senderId: "ou_1" })), "oc");
});

test("group chats isolate context by sender", () => {
  assert.equal(conversationKey(message({ chatType: "group", senderId: "ou_1" })), "oc:ou_1");
  assert.equal(conversationKey(message({ chatType: "group", senderId: "ou_2" })), "oc:ou_2");
});

test("conversation workspaces are stable and isolated", () => {
  assert.equal(workspaceSessionId("oc"), workspaceSessionId("oc"));
  assert.notEqual(workspaceSessionId("oc:ou_1"), workspaceSessionId("oc:ou_2"));
  assert.match(workspaceSessionId("oc"), /^[a-f0-9]{24}$/);
});
