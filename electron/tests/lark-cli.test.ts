import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLarkEvent } from "../lark-event.js";

test("normalizes a Feishu message event", () => {
  const message = normalizeLarkEvent({
    header: {
      event_id: "evt_1",
      event_type: "im.message.receive_v1"
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
  assert.equal(message?.text, "帮我查一下加盟费用");
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
