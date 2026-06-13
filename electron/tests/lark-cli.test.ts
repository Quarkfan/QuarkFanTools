import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLarkEvent } from "../lark-event.js";

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
