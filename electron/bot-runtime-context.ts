import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { larkRuntimeEnvironment, resolveLarkCommand } from "./lark-cli.js";
import { botStateRoot } from "./paths.js";
import { larkConnectorBot, primaryProvider } from "./platform-connectors.js";
import type { BotConfig, ImProviderId } from "./types.js";
import { resolveWeComCommand, wecomRuntimeEnvironment } from "./wecom-cli.js";

export interface CliChannel {
  id: string;
  provider: ImProviderId;
  label: string;
  purposes: Array<"input" | "reply" | "knowledge" | "delivery">;
  command: string;
  prefix: string[];
  baseArgs: string[];
  env: Record<string, string>;
  cwd: string;
  stateDir: string;
}

export interface BotRuntimeContext {
  botId: string;
  botName: string;
  primaryProvider: ImProviderId;
  channels: CliChannel[];
  deliveryRoutes: Array<{
    id: string;
    provider: ImProviderId;
    chatId: string;
    name?: string;
  }>;
}

export async function buildBotRuntimeContext(bot: BotConfig, workspace: string): Promise<BotRuntimeContext> {
  const channels: CliChannel[] = [];
  channels.push(await buildPrimaryChannel(bot, workspace));
  const larkConnector = larkConnectorBot(bot);
  if (larkConnector && primaryProvider(bot) !== "lark") {
    channels.push(await buildLarkChannel(larkConnector, workspace, "lark-knowledge", ["knowledge", "delivery"]));
  }
  return {
    botId: bot.id,
    botName: bot.name,
    primaryProvider: primaryProvider(bot),
    channels,
    deliveryRoutes: (bot.deliveryRoutes ?? [])
      .filter((route) => route.enabled)
      .map((route) => ({
        id: route.id,
        provider: route.provider,
        chatId: route.chatId,
        name: route.name
      }))
  };
}

export async function syncBotRuntimeWorkspace(bot: BotConfig, workspace: string): Promise<BotRuntimeContext> {
  const context = await buildBotRuntimeContext(bot, workspace);
  const qftDir = path.join(workspace, ".quarkfan");
  await mkdir(qftDir, { recursive: true });
  await writeFile(path.join(qftDir, "cli-channels.json"), `${JSON.stringify(context, null, 2)}\n`, "utf8");
  await writeFile(path.join(workspace, "CLAUDE.md"), runtimeContextMarkdown(context), "utf8");
  const wrapperPath = path.join(workspace, "qft-cli");
  await writeFile(wrapperPath, qftCliWrapper(), "utf8");
  await chmod(wrapperPath, 0o755);
  return context;
}

async function buildPrimaryChannel(bot: BotConfig, workspace: string): Promise<CliChannel> {
  if (primaryProvider(bot) === "wecom") {
    return buildWeComChannel(bot, workspace, "wecom-primary", ["input", "reply", "delivery"]);
  }
  return buildLarkChannel(bot, workspace, "lark-primary", ["input", "reply", "knowledge", "delivery"]);
}

async function buildLarkChannel(bot: BotConfig, workspace: string, id: string, purposes: CliChannel["purposes"]): Promise<CliChannel> {
  const { command, prefix } = await resolveLarkCommand(bot);
  const env = larkRuntimeEnvironment(bot);
  return {
    id,
    provider: "lark",
    label: id === "lark-primary" ? "飞书主通道" : "飞书知识连接器",
    purposes,
    command,
    prefix,
    baseArgs: bot.profile ? ["--profile", bot.profile] : [],
    env: compactEnv(env),
    cwd: workspace,
    stateDir: path.join(botStateRoot(bot), "lark-cli")
  };
}

async function buildWeComChannel(bot: BotConfig, workspace: string, id: string, purposes: CliChannel["purposes"]): Promise<CliChannel> {
  const { command, prefix } = await resolveWeComCommand(bot);
  const env = wecomRuntimeEnvironment(bot);
  return {
    id,
    provider: "wecom",
    label: "企业微信主通道",
    purposes,
    command,
    prefix,
    baseArgs: bot.profile ? ["--agent-id", bot.profile] : [],
    env: compactEnv(env),
    cwd: workspace,
    stateDir: path.join(botStateRoot(bot), "wecom-cli")
  };
}

function compactEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function runtimeContextMarkdown(context: BotRuntimeContext): string {
  return [
    "# QuarkfanTools Runtime Context",
    "",
    `Bot: ${context.botName} (${context.botId})`,
    `Primary IM Provider: ${context.primaryProvider}`,
    "",
    "## CLI 调用规则",
    "",
    "- 优先使用当前目录下的 `./qft-cli`，不要直接调用平台原始 CLI。",
    "- `./qft-cli <provider> <args...>` 会按当前 Bot 授权路由到隔离 CLI 通道。",
    "- 未出现在 channel manifest 中的平台和用途不可假设可用。",
    "- 不要执行登录、初始化或修改凭据的命令；凭据由 QuarkfanTools 配置页和主进程管理。",
    "",
    "## 可用 CLI Channels",
    "",
    ...context.channels.map((channel) => [
      `- ${channel.id}`,
      `  - provider: ${channel.provider}`,
      `  - purposes: ${channel.purposes.join(", ")}`,
      `  - command: ./qft-cli ${channel.provider} ...`
    ].join("\n")),
    "",
    "## 结果投递",
    "",
    context.deliveryRoutes.length
      ? context.deliveryRoutes.map((route) => `- ${route.name || route.id}: ${route.provider} / ${route.chatId}`).join("\n")
      : "- 未配置额外投递路由；最终回复由 QuarkfanTools 回到原消息平台。"
  ].join("\n");
}

function qftCliWrapper(): string {
  return `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const [provider, ...args] = process.argv.slice(2);
if (!provider || args.length === 0) {
  console.error("Usage: qft-cli <provider> <args...>");
  process.exit(64);
}

const manifest = JSON.parse(readFileSync(join(process.cwd(), ".quarkfan", "cli-channels.json"), "utf8"));
const channel = manifest.channels.find((item) => item.provider === provider);
if (!channel) {
  console.error("Provider is not available for this Bot: " + provider);
  process.exit(65);
}

const blocked = args.join(" ");
if (/\\b(auth\\s+login|config\\s+init|keychain-downgrade)\\b/.test(blocked)) {
  console.error("Credential and config commands are managed by QuarkfanTools and cannot be run from Agent workspace.");
  process.exit(66);
}

const child = spawnSync(channel.command, [...(channel.prefix || []), ...(channel.baseArgs || []), ...args], {
  cwd: channel.cwd || process.cwd(),
  env: { ...process.env, ...(channel.env || {}) },
  stdio: "inherit"
});
process.exit(child.status ?? 1);
`;
}
