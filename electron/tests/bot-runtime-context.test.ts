import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildBotRuntimeContext, syncBotRuntimeWorkspace } from "../bot-runtime-context.js";
import type { BotConfig } from "../types.js";

async function fakeCli(root: string): Promise<string> {
  const cliPath = path.join(root, "fake-cli.js");
  await writeFile(cliPath, `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.QFT_FAKE_LOG, JSON.stringify({ argv: process.argv.slice(2), env: { WECOM_CLI_CONFIG_DIR: process.env.WECOM_CLI_CONFIG_DIR, LARKSUITE_CLI_CONFIG_DIR: process.env.LARKSUITE_CLI_CONFIG_DIR } }) + "\\n");
`, "utf8");
  await chmod(cliPath, 0o755);
  return cliPath;
}

function wecomBot(cliPath: string): BotConfig {
  return {
    id: "wecom-bot",
    name: "企业微信 Bot",
    enabled: true,
    provider: "wecom",
    cliPath,
    profile: "100001",
    appId: "corp_id",
    appSecret: "secret",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["message.receive"],
    providerOptions: {
      eventCommand: "/usr/local/bin/wecom-event-bridge"
    },
    connectors: {
      lark: {
        enabled: true,
        cliPath,
        profile: "lark-user",
        appId: "cli_lark",
        appSecret: "lark_secret",
        oauthScopes: ["search:docs:read"]
      }
    },
    deliveryRoutes: [{
      id: "route-lark",
      enabled: true,
      provider: "lark",
      chatId: "oc_lark",
      mode: "copy-final-reply",
      name: "同步到飞书"
    }],
    skillNames: [],
    pendingReaction: "OnIt",
    ownerOpenId: ""
  };
}

test("builds runtime channels for wecom primary and lark knowledge connector", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-runtime-context-"));
  const cliPath = await fakeCli(root);
  const workspace = path.join(root, "workspace");
  const context = await buildBotRuntimeContext(wecomBot(cliPath), workspace);

  assert.equal(context.primaryProvider, "wecom");
  assert.equal(context.channels.length, 2);
  assert.equal(context.channels[0]?.id, "wecom-primary");
  assert.equal(context.channels[0]?.provider, "wecom");
  assert.deepEqual(context.channels[0]?.baseArgs, ["--agent-id", "100001"]);
  assert.ok(context.channels[0]?.env.WECOM_CLI_CONFIG_DIR?.endsWith(path.join("state", "bots", "wecom-bot", "wecom-cli")));

  assert.equal(context.channels[1]?.id, "lark-knowledge");
  assert.equal(context.channels[1]?.provider, "lark");
  assert.deepEqual(context.channels[1]?.purposes, ["knowledge", "delivery"]);
  assert.deepEqual(context.channels[1]?.baseArgs, ["--profile", "lark-user"]);
  assert.ok(context.channels[1]?.env.LARKSUITE_CLI_CONFIG_DIR?.endsWith(path.join("state", "bots", "wecom-bot", "lark-cli")));
  assert.deepEqual(context.deliveryRoutes, [{
    id: "route-lark",
    provider: "lark",
    chatId: "oc_lark",
    name: "同步到飞书"
  }]);
});

test("syncs runtime workspace files and qft-cli routes only authorized channels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-runtime-workspace-"));
  const cliPath = await fakeCli(root);
  const workspace = path.join(root, "workspace");
  const logPath = path.join(root, "fake-cli.log");

  await syncBotRuntimeWorkspace(wecomBot(cliPath), workspace);
  const manifest = JSON.parse(await readFile(path.join(workspace, ".quarkfan", "cli-channels.json"), "utf8"));
  const claudeMd = await readFile(path.join(workspace, "CLAUDE.md"), "utf8");
  const wrapper = path.join(workspace, "qft-cli");
  const wrapperStat = await stat(wrapper);

  assert.equal(manifest.primaryProvider, "wecom");
  assert.equal(manifest.channels.length, 2);
  assert.match(claudeMd, /Primary IM Provider: wecom/);
  assert.match(claudeMd, /wecom-primary/);
  assert.match(claudeMd, /lark-knowledge/);
  assert.ok((wrapperStat.mode & 0o111) !== 0);

  const ok = spawnSync(wrapper, ["wecom", "msg", "send_message", "{\"content\":\"hello\"}"], {
    cwd: workspace,
    env: { ...process.env, QFT_FAKE_LOG: logPath },
    encoding: "utf8"
  });
  assert.equal(ok.status, 0);
  const calls = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(calls[0].argv, ["--agent-id", "100001", "msg", "send_message", "{\"content\":\"hello\"}"]);
  assert.ok(calls[0].env.WECOM_CLI_CONFIG_DIR);

  const blocked = spawnSync(wrapper, ["wecom", "auth", "login"], {
    cwd: workspace,
    env: { ...process.env, QFT_FAKE_LOG: logPath },
    encoding: "utf8"
  });
  assert.equal(blocked.status, 66);
  assert.match(blocked.stderr, /Credential and config commands/);

  const unavailable = spawnSync(wrapper, ["dingtalk", "message", "send"], {
    cwd: workspace,
    env: { ...process.env, QFT_FAKE_LOG: logPath },
    encoding: "utf8"
  });
  assert.equal(unavailable.status, 65);
  assert.match(unavailable.stderr, /Provider is not available/);
});
