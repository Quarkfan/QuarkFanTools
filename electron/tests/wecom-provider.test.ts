import assert from "node:assert/strict";
import test from "node:test";
import { isWeComEventSubscribeCommand, wecomMethodArgs } from "../wecom-commands.js";
import { normalizeWeComEvent } from "../wecom-event.js";
import type { BotConfig } from "../types.js";

const bot: BotConfig = {
  id: "wecom-bot",
  name: "企业微信 Bot",
  enabled: true,
  provider: "wecom",
  cliPath: "",
  profile: "100001",
  appId: "corp_id",
  appSecret: "secret",
  receiveIdentity: "bot",
  replyIdentity: "bot",
  eventTypes: ["message.receive"],
  providerOptions: {
    token: "tok",
    aesKey: "aes"
  },
  skillNames: [],
  pendingReaction: "OnIt",
  ownerOpenId: ""
};

test("builds official wecom-cli method command args", () => {
  assert.deepEqual(wecomMethodArgs("msg", "send_message", { chat_id: "chat-1", content: "hello" }), [
    "msg",
    "send_message",
    "{\"chat_id\":\"chat-1\",\"content\":\"hello\"}"
  ]);
});

test("recognizes wecom event bridge or polling processes", () => {
  assert.equal(isWeComEventSubscribeCommand("/Applications/QuarkfanTools.app/runtime/wecom-cli/bin/wecom-cli msg get_message '{}'"), true);
  assert.equal(isWeComEventSubscribeCommand("/usr/bin/node server.js"), false);
});

test("normalizes a wecom text message event", () => {
  const message = normalizeWeComEvent({
    event_id: "evt_1",
    msgid: "wm_1",
    msgtype: "text",
    chatid: "wr_1",
    roomid: "wr_1",
    from: "zhangsan",
    text: {
      content: "帮我查一下库存"
    }
  });
  assert.equal(message?.provider, "wecom");
  assert.equal(message?.eventId, "evt_1");
  assert.equal(message?.messageId, "wm_1");
  assert.equal(message?.chatId, "wr_1");
  assert.equal(message?.chatType, "group");
  assert.equal(message?.senderId, "zhangsan");
  assert.equal(message?.text, "帮我查一下库存");
});
