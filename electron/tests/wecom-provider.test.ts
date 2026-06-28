import assert from "node:assert/strict";
import test from "node:test";
import { defaultPollingPayload, defaultPollingPayloads, extractWeComChatListFromOutput, extractWeComEventsFromOutput, friendlyWeComCliError, isWeComCliNeedsInitError } from "../wecom-cli.js";
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

test("extracts wecom polling output from common JSON shapes", () => {
  assert.equal(extractWeComEventsFromOutput(JSON.stringify({ data: { list: [{ msgid: "m1" }, { msgid: "m2" }] } })).length, 2);
  assert.equal(extractWeComEventsFromOutput(`${JSON.stringify({ msgid: "m3" })}\n${JSON.stringify({ messages: [{ msgid: "m4" }] })}\n`).length, 2);
});

test("extracts wecom chat list output from direct and rpc text shapes", () => {
  const direct = extractWeComChatListFromOutput(JSON.stringify({
    chats: [{ chat_id: "wr_1", chat_name: "项目群", last_msg_time: "2026-06-27 09:30:00", msg_count: 3 }]
  }));
  assert.deepEqual(direct, [{ chatId: "wr_1", chatName: "项目群", lastMsgTime: "2026-06-27 09:30:00", msgCount: 3 }]);
  const rpc = extractWeComChatListFromOutput(JSON.stringify({
    jsonrpc: "2.0",
    result: {
      content: [{ text: JSON.stringify({ chats: [{ chat_id: "wr_2", chat_name: "质量群" }] }) }]
    }
  }));
  assert.deepEqual(rpc, [{ chatId: "wr_2", chatName: "质量群", lastMsgTime: undefined, msgCount: undefined }]);
});

test("builds required wecom polling payload from bot options", () => {
  const payload = defaultPollingPayload({
    ...bot,
    providerOptions: {
      pollChatType: "2",
      pollChatId: "wr_chat",
      pollWindowSeconds: "60"
    }
  }, new Date(2026, 5, 27, 9, 30, 0));
  assert.deepEqual(payload, {
    chat_type: 2,
    chatid: "wr_chat",
    begin_time: "2026-06-27 09:29:00",
    end_time: "2026-06-27 09:30:00"
  });
});

test("builds multiple wecom polling payloads with per-chat type prefixes", () => {
  const payloads = defaultPollingPayloads({
    ...bot,
    providerOptions: {
      pollChatType: "2",
      pollChatId: "2:wr_group\n1:zhangsan, wr_default",
      pollWindowSeconds: "60"
    }
  }, new Date(2026, 5, 27, 9, 30, 0));
  assert.deepEqual(payloads.map((payload) => ({ chat_type: payload.chat_type, chatid: payload.chatid })), [
    { chat_type: 2, chatid: "wr_group" },
    { chat_type: 1, chatid: "zhangsan" },
    { chat_type: 2, chatid: "wr_default" }
  ]);
  assert.equal(payloads[0]?.begin_time, "2026-06-27 09:29:00");
  assert.equal(payloads[0]?.end_time, "2026-06-27 09:30:00");
});

test("rejects default wecom polling without chat id before calling cli", () => {
  assert.throws(
    () => defaultPollingPayload(bot, new Date(2026, 5, 27, 9, 30, 0)),
    /轮询 Chat ID/
  );
});

test("detects and explains missing official wecom-cli initialization", () => {
  const error = new Error("未找到 MCP 配置缓存，请先运行 `wecom-cli init`");
  assert.equal(isWeComCliNeedsInitError(error), true);
  assert.match(friendlyWeComCliError(error).message, /初始化\/刷新企业微信 CLI 缓存/);
  assert.match(friendlyWeComCliError(error).message, /Bot ID \/ Secret/);
});
