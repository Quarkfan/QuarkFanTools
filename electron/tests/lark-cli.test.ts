import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLarkEvent } from "../lark-event.js";
import { messageTargetsBot } from "../message-target.js";
import { selectLarkMessageTarget } from "../lark-message-router.js";
import { larkRuntimeEnvironment } from "../lark-cli.js";
import { filterLarkEventStderr, isLarkEventSubscribeCommand, larkEventSubscribeArgs, larkUserLoginArgs } from "../lark-commands.js";
import { normalizeLarkConfigProfilesContent } from "../lark-config-profiles.js";
import type { BotConfig, LarkBotIdentity } from "../types.js";

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
    "--profile",
    "qft-mentor",
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

test("lark runtime uses per-bot temp and config directories", () => {
  const env = larkRuntimeEnvironment(bot);
  assert.match(env.HOME ?? "", /mentor/);
  assert.match(env.TMPDIR ?? "", /bots\/mentor\/tmp$/);
  assert.match(env.LARKSUITE_CLI_CONFIG_DIR ?? "", /bots\/mentor\/lark-cli$/);
  assert.match(env.LARKSUITE_CLI_LOG_DIR ?? "", /bots\/mentor\/lark-cli\/logs$/);
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

test("normalizes legacy duplicate lark-cli app profiles", () => {
  const normalized = normalizeLarkConfigProfilesContent(JSON.stringify({
    apps: [
      {
        appId: "cli_other",
        name: "qft-other"
      },
      {
        appId: "cli_test",
        appSecret: { source: "keychain", id: "appsecret:cli_test" },
        users: [{ userOpenId: "ou_1", userName: "User" }]
      },
      {
        appId: "cli_test",
        name: "qft-mentor",
        appSecret: { source: "keychain", id: "appsecret:cli_test" },
        users: [{ userOpenId: "ou_1", userName: "User" }]
      }
    ]
  }), bot);
  assert.ok(normalized);
  const parsed = JSON.parse(normalized);
  assert.deepEqual(parsed.apps.map((item: { appId: string; name?: string }) => [item.appId, item.name]), [
    ["cli_other", "qft-other"],
    ["cli_test", "qft-mentor"]
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
      app_id: "cli_test",
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
        mentions: [{
          key: "@_user_1",
          id: { open_id: "ou_bot", user_id: "bot_user", union_id: "on_bot", app_id: "cli_test" },
          name: "人生导师",
          tenant_key: "tenant_1"
        }],
        content: JSON.stringify({ text: "帮我查一下加盟费用" })
      }
    }
  });

  assert.equal(message?.eventId, "evt_1");
  assert.equal(message?.messageId, "om_1");
  assert.equal(message?.senderId, "ou_1");
  assert.equal(message?.messageType, "text");
  assert.equal(message?.text, "帮我查一下加盟费用");
  assert.equal(message?.sourceAppId, "cli_test");
  assert.deepEqual(message?.mentions, [{
    key: "@_user_1",
    name: "人生导师",
    tenantKey: "tenant_1",
    id: {
      openId: "ou_bot",
      userId: "bot_user",
      unionId: "on_bot",
      appId: "cli_test"
    }
  }]);
  assert.deepEqual(message?.resources, []);
  assert.ok(message?.receivedAt);
  assert.equal(message?.createdAt, "1781330000000");
});

test("routes by mention target before event source app id", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1", app_id: "cli_test" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_source_app",
        chat_id: "oc_1",
        chat_type: "group",
        mentions: [{ id: { open_id: "ou_bot" }, name: "飞书里的展示名" }],
        content: JSON.stringify({ text: "查一下订单状态" })
      }
    }
  });
  const anotherBot: BotConfig = { ...bot, id: "finance", name: "财务助手", appId: "cli_finance" };

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message), false);
  assert.equal(messageTargetsBot(anotherBot, message, { openId: "ou_finance", appName: "飞书里的展示名" }, true), true);
});

test("routes mentioned group messages by resolved bot open id", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_open_id",
        chat_id: "oc_1",
        chat_type: "group",
        mentions: [{ id: { open_id: "ou_target_bot" }, name: "飞书里的展示名" }],
        content: JSON.stringify({ text: "查一下订单状态" })
      }
    }
  });

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message, { openId: "ou_target_bot", appName: "真实机器人名" }, true), true);
  assert.equal(messageTargetsBot(bot, message, { openId: "ou_other_bot", appName: "其他机器人" }, true), false);
});

test("routes mentioned group messages by bot name when mention open id differs from bot info", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1", app_id: "cli_work_assistant" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_observed_mention",
        chat_id: "oc_1",
        chat_type: "group",
        mentions: [{
          key: "@_user_1",
          id: { open_id: "ou_mention_subject", union_id: "on_mention_subject" },
          name: "牛马的人生导师"
        }],
        content: JSON.stringify({ text: "你好" })
      }
    }
  });
  const mentorBot: BotConfig = { ...bot, name: "人生导师", appId: "cli_mentor" };
  const workBot: BotConfig = { ...bot, id: "work", name: "工作助手", appId: "cli_work_assistant" };

  assert.ok(message);
  assert.equal(messageTargetsBot(mentorBot, message, { openId: "ou_bot_info_mentor", appName: "牛马的人生导师" }, true), true);
  assert.equal(messageTargetsBot(workBot, message, { openId: "ou_bot_info_work", appName: "牛马的工作助手" }, true), false);
});

test("cross-delivered events route to the mentioned bot", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1", app_id: "cli_work_assistant" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_shared_ingress",
        chat_id: "oc_1",
        chat_type: "group",
        mentions: [{
          key: "@_user_1",
          id: { open_id: "ou_mention_subject", union_id: "on_mention_subject" },
          name: "牛马的人生导师"
        }],
        content: JSON.stringify({ text: "魔介的店都哪里有" })
      }
    }
  });
  const mentorBot: BotConfig = { ...bot, id: "default", name: "人生导师", appId: "cli_mentor" };
  const workBot: BotConfig = { ...bot, id: "work", name: "工作助手", appId: "cli_work_assistant" };
  const identities = new Map<string, LarkBotIdentity>([
    ["default", { openId: "ou_bot_info_mentor", appName: "牛马的人生导师" }],
    ["work", { openId: "ou_bot_info_work", appName: "牛马的工作助手" }]
  ]);

  assert.ok(message);
  const route = selectLarkMessageTarget([mentorBot, workBot], message, identities, true);
  assert.equal(route.bot?.id, "default");
  assert.equal(route.reason, "mention-match");
  assert.equal(route.ignored.length, 1);
  assert.equal(route.ignored[0].bot.id, "work");
});

test("does not route ambiguous group messages in strict multi-bot mode", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_ambiguous",
        chat_id: "oc_1",
        chat_type: "group",
        content: JSON.stringify({ text: "@_user_1 你好" })
      }
    }
  });

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message, { openId: "ou_target_bot" }, true), false);
  assert.equal(messageTargetsBot(bot, message, { openId: "ou_target_bot" }, false), true);
});

test("routes legacy messages by event source app id when mention metadata is absent", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1", app_id: "cli_test" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_source_app_legacy",
        chat_id: "oc_1",
        chat_type: "group",
        content: JSON.stringify({ text: "@_user_1 查一下订单状态" })
      }
    }
  });
  const anotherBot: BotConfig = { ...bot, id: "finance", name: "财务助手", appId: "cli_finance" };

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message, undefined, true), true);
  assert.equal(messageTargetsBot(anotherBot, message, undefined, true), false);
});

test("routes mentioned group messages only to the matching bot", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_mentioned",
        chat_id: "oc_1",
        chat_type: "group",
        mentions: [{ id: { app_id: "cli_test" }, name: "人生导师" }],
        content: JSON.stringify({ text: "查一下订单状态" })
      }
    }
  });
  const anotherBot: BotConfig = { ...bot, id: "finance", name: "财务助手", appId: "cli_finance" };

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message), true);
  assert.equal(messageTargetsBot(anotherBot, message), false);
});

test("keeps private or legacy messages without mention metadata routable", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_private",
        chat_id: "oc_1",
        chat_type: "p2p",
        content: JSON.stringify({ text: "直接问机器人" })
      }
    }
  });

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message), true);
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
