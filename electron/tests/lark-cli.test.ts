import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { normalizeLarkEvent } from "../lark-event.js";
import { filterLarkEventStderr, isLarkEventSubscribeCommand, larkEventSubscribeArgs, larkUserLoginArgs } from "../lark-commands.js";
import { getLarkBotIdentityFromOpenApi, larkRuntimeEnvironment, materializeLarkCachedFile, normalizeLarkConfigProfilesContent, parseLarkBotIdentity, removeMessageReaction, resolveLarkCommand, sendTextToChat } from "../lark-cli.js";
import { selectLarkMessageTarget } from "../lark-message-router.js";
import { messageTargetsBot } from "../message-target.js";
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

test("uses a local lark-cli from PATH before the bundled runtime", async () => {
  const previousPath = process.env.PATH;
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-local-lark-cli-"));
  const binary = path.join(dir, "lark-cli");
  try {
    await writeFile(binary, "#!/bin/sh\nexit 0\n");
    await chmod(binary, 0o755);
    process.env.PATH = `${dir}${path.delimiter}${previousPath ?? ""}`;

    const command = await resolveLarkCommand({ ...bot, cliPath: "" });
    const env = larkRuntimeEnvironment({ ...bot, cliPath: "" });

    assert.equal(command.command, binary);
    assert.equal(command.prefix.length, 0);
    assert.equal(env.PATH?.split(path.delimiter)[0], dir);
  } finally {
    process.env.PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test("uses an explicitly configured lark-cli path before PATH discovery", async () => {
  const previousPath = process.env.PATH;
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-configured-lark-cli-"));
  const configuredDir = await mkdtemp(path.join(os.tmpdir(), "qft-configured-lark-cli-explicit-"));
  const localBinary = path.join(dir, "lark-cli");
  const configuredBinary = path.join(configuredDir, "custom-lark-cli");
  try {
    await writeFile(localBinary, "#!/bin/sh\nexit 0\n");
    await chmod(localBinary, 0o755);
    await writeFile(configuredBinary, "#!/bin/sh\nexit 0\n");
    await chmod(configuredBinary, 0o755);
    process.env.PATH = `${dir}${path.delimiter}${previousPath ?? ""}`;

    const command = await resolveLarkCommand({ ...bot, cliPath: configuredBinary });
    const env = larkRuntimeEnvironment({ ...bot, cliPath: configuredBinary });

    assert.equal(command.command, configuredBinary);
    assert.equal(env.PATH?.split(path.delimiter)[0], configuredDir);
  } finally {
    process.env.PATH = previousPath;
    await Promise.all([
      rm(dir, { recursive: true, force: true }),
      rm(configuredDir, { recursive: true, force: true })
    ]);
  }
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

test("parses bot identity from common lark api response shapes", () => {
  assert.deepEqual(parseLarkBotIdentity({
    bot: { open_id: "ou_bot", app_name: "客服助手" }
  }), {
    appName: "客服助手",
    openId: "ou_bot"
  });
  assert.deepEqual(parseLarkBotIdentity({
    data: { bot: { open_id: "ou_nested", app_name: "嵌套助手" } }
  }), {
    appName: "嵌套助手",
    openId: "ou_nested"
  });
  assert.deepEqual(parseLarkBotIdentity({
    ok: true,
    identity: "bot",
    data: {}
  }), {});
});

test("fetches bot identity directly from OpenAPI when lark api envelope is empty", async () => {
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v3/tenant_access_token/internal")) {
      return Response.json({ code: 0, tenant_access_token: "t-token" });
    }
    return Response.json({
      code: 0,
      msg: "ok",
      bot: {
        app_name: "客服助手",
        open_id: "ou_direct"
      }
    });
  }) as typeof fetch;

  try {
    assert.deepEqual(await getLarkBotIdentityFromOpenApi(bot), {
      appName: "客服助手",
      openId: "ou_direct"
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(calls[1].url, "https://open.feishu.cn/open-apis/bot/v3/info");
    assert.equal((calls[1].init?.headers as Record<string, string>).authorization, "Bearer t-token");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("uses current drive export flags for controlled file cache materialization", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-lark-export-flags-"));
  const binary = path.join(dir, "lark-cli");
  const logPath = path.join(dir, "calls.jsonl");
  const outputDir = path.join(dir, "out");
  await writeFile(binary, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const path = require('path');",
    `fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    "if (process.argv.includes('+export')) {",
    "  const name = process.argv[process.argv.indexOf('--file-name') + 1];",
    "  fs.writeFileSync(path.join(process.cwd(), name), 'exported');",
    "}",
    "process.stdout.write(JSON.stringify({ ok: true }));",
    ""
  ].join("\n"));
  await chmod(binary, 0o755);

  try {
    await materializeLarkCachedFile({ ...bot, id: "export-flags", cliPath: binary }, {
      action: "drive-export",
      fileToken: `tok-export-flags-${process.pid}`,
      docType: "slides",
      fileExtension: "pptx",
      fileName: "deck.pptx",
      prompt: "inspect"
    }, outputDir);

    const calls = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as string[]);
    const exportCall = calls.find((args) => args.includes("+export"));
    assert.ok(exportCall);
    assert.ok(exportCall.includes("--token"));
    assert.ok(!exportCall.includes("--file-token"));
    assert.deepEqual(exportCall.slice(exportCall.indexOf("--file-name"), exportCall.indexOf("--file-name") + 2), ["--file-name", "deck.pptx"]);
    assert.deepEqual(exportCall.slice(exportCall.indexOf("--output-dir"), exportCall.indexOf("--output-dir") + 2), ["--output-dir", "."]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("uses typed shortcut flags for sending text and deleting reactions", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-lark-shortcut-flags-"));
  const binary = path.join(dir, "lark-cli");
  const logPath = path.join(dir, "calls.jsonl");
  await writeFile(binary, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    `fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    "process.stdout.write(JSON.stringify({ ok: true }));",
    ""
  ].join("\n"));
  await chmod(binary, 0o755);

  try {
    const fakeBot = { ...bot, id: "shortcut-flags", cliPath: binary };
    await sendTextToChat(fakeBot, "oc_chat", "hello");
    await removeMessageReaction(fakeBot, "om_message", "reaction_1");

    const calls = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as string[]);
    const sendCall = calls.find((args) => args.includes("+messages-send"));
    assert.ok(sendCall);
    assert.deepEqual(sendCall.slice(sendCall.indexOf("--text"), sendCall.indexOf("--text") + 2), ["--text", "hello"]);
    assert.ok(!sendCall.includes("--content"));

    const deleteCall = calls.find((args) => args.includes("delete"));
    assert.ok(deleteCall);
    assert.deepEqual(deleteCall.slice(deleteCall.indexOf("--message-id"), deleteCall.indexOf("--message-id") + 2), ["--message-id", "om_message"]);
    assert.deepEqual(deleteCall.slice(deleteCall.indexOf("--reaction-id"), deleteCall.indexOf("--reaction-id") + 2), ["--reaction-id", "reaction_1"]);
    assert.ok(!deleteCall.includes("--params"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
  assert.equal(message?.sourceAppId, undefined);
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

test("ignores group messages without mention metadata even when source app id matches", () => {
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
  assert.equal(messageTargetsBot(bot, message, undefined, true), false);
  assert.equal(messageTargetsBot(anotherBot, message, undefined, true), false);
});

test("single lark bot still ignores unmentioned group messages under strict routing", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1", app_id: "cli_test" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_unmentioned_group",
        chat_id: "oc_1",
        chat_type: "group",
        content: JSON.stringify({ text: "没有艾特机器人" })
      }
    }
  });

  assert.ok(message);
  const route = selectLarkMessageTarget([bot], message, new Map([["default", { openId: "ou_target_bot", appName: "测试助手" }]]), true);
  assert.equal(route.bot, null);
  assert.equal(route.reason, "missing-group-mention-metadata");
});

test("normalizes group-like chat types before strict mention routing", () => {
  const message = normalizeLarkEvent({
    header: { event_type: "im.message.receive_v1", app_id: "cli_test" },
    event: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_unmentioned_group_chat",
        chat_id: "oc_1",
        chat_type: "group_chat",
        content: JSON.stringify({ text: "这个群聊类型也不能免艾特插嘴" })
      }
    }
  });

  assert.ok(message);
  assert.equal(message.chatType, "group");
  const route = selectLarkMessageTarget([bot], message, new Map([["mentor", { openId: "ou_target_bot", appName: "人生导师" }]]), true);
  assert.equal(route.bot, null);
  assert.equal(route.reason, "missing-group-mention-metadata");
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
        content: JSON.stringify({ text: "你好" })
      }
    }
  });

  assert.ok(message);
  assert.equal(messageTargetsBot(bot, message, { openId: "ou_target_bot" }, true), true);
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
