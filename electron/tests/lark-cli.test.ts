import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLarkEvent } from "../lark-event.js";
import { filterLarkEventStderr, isLarkEventSubscribeCommand, larkEventSubscribeArgs, larkUserLoginArgs } from "../lark-commands.js";
import type { BotConfig } from "../types.js";

const bot: BotConfig = {
  id: "mentor",
  name: "人生导师",
  enabled: true,
  cliPath: "",
  profile: "",
  appId: "cli_test",
  appSecret: "secret",
  receiveIdentity: "bot",
  replyIdentity: "bot",
  eventTypes: ["im.message.receive_v1"],
  skillNames: [],
  pendingReaction: "OnIt",
  ownerOpenId: ""
};

test("event subscription does not use unsafe parallel subscription mode", () => {
  assert.deepEqual(larkEventSubscribeArgs(bot), [
    "event",
    "+subscribe",
    "--as",
    "bot",
    "--event-types",
    "im.message.receive_v1",
    "--format",
    "ndjson"
  ]);
});

test("recognizes only lark event subscriber processes for stale PID cleanup", () => {
  assert.equal(isLarkEventSubscribeCommand("/Applications/QuarkfanTools.app/runtime/lark-cli event +subscribe --as bot"), true);
  assert.equal(isLarkEventSubscribeCommand("/Applications/QuarkfanTools.app/runtime/lark-cli event stop --force"), false);
  assert.equal(isLarkEventSubscribeCommand("/usr/bin/node other-process.js"), false);
});

test("user login requests the document search scope", () => {
  assert.deepEqual(larkUserLoginArgs(), [
    "auth",
    "login",
    "--recommend",
    "--scope",
    "search:docs:read",
    "--no-wait",
    "--json"
  ]);
});

test("user login merges custom OAuth scopes", () => {
  assert.deepEqual(larkUserLoginArgs(["drive:export:readonly", "docs:document:export,search:docs:read"]), [
    "auth",
    "login",
    "--recommend",
    "--scope",
    "search:docs:read,drive:export:readonly,docs:document:export",
    "--no-wait",
    "--json"
  ]);
});

test("filters benign reaction event handler noise but preserves real connection errors", () => {
  assert.equal(
    filterLarkEventStderr("[SDK Error] handle message failed, message_type: event, err: event type: im.message.reaction.deleted_v1, not found handler [conn_id=1]"),
    ""
  );
  assert.equal(
    filterLarkEventStderr([
      "[SDK Error] handle message failed, message_type: event, err: event type: im.message.reaction.created_v1, not found handler [conn_id=1]",
      "[SDK Error] websocket disconnected"
    ].join("\n")),
    "[SDK Error] websocket disconnected"
  );
});

test("normalizes a Feishu message event", () => {
  const message = normalizeLarkEvent({
    header: {
      event_id: "evt_1",
      event_type: "im.message.receive_v1",
      create_time: "1781330000000"
    },
    event: {
      sender: {
        sender_id: { open_id: "ou_1" }
      },
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        chat_type: "group",
        content: JSON.stringify({ text: "帮我查一下加盟费用" })
      }
    }
  });

  assert.equal(message?.eventId, "evt_1");
  assert.equal(message?.messageId, "om_1");
  assert.equal(message?.senderId, "ou_1");
  assert.equal(message?.messageType, "text");
  assert.equal(message?.text, "帮我查一下加盟费用");
  assert.deepEqual(message?.resources, []);
  assert.ok(message?.receivedAt);
  assert.equal(message?.createdAt, "1781330000000");
});

test("normalizes image resources without text", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_image",
        chat_id: "oc_1",
        chat_type: "p2p",
        message_type: "image",
        content: JSON.stringify({ image_key: "img_1" })
      }
    }
  });

  assert.equal(message?.text, "[图片消息]");
  assert.deepEqual(message?.resources, [{ key: "img_1", type: "image" }]);
});

test("preserves Office attachment names for built-in preprocessing", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_file",
        chat_id: "oc_1",
        chat_type: "p2p",
        message_type: "file",
        content: JSON.stringify({ file_key: "file_1", file_name: "review.pptx" })
      }
    }
  });

  assert.deepEqual(message?.resources, [{ key: "file_1", type: "file", name: "review.pptx" }]);
});

test("ignores unrelated event types", () => {
  assert.equal(
    normalizeLarkEvent({
      header: { event_type: "contact.user.updated_v3" },
      event: {}
    }),
    null
  );
});
