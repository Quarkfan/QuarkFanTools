import electron from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheDownloadedMessageResource, materializeCachedMessageResource } from "./file-cache.js";
import { projectRoot, stateRoot } from "./paths.js";
import type { BotConfig, ChatMessage, ChatMessageResource } from "./types.js";
import { isWeComEventSubscribeCommand, wecomEventBridgeCommand, wecomMethodArgs } from "./wecom-commands.js";
import { normalizeWeComEvent } from "./wecom-event.js";

const { app } = electron;

function bundledWeComBinary(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime", "wecom-cli", "bin", "wecom-cli")
    : "wecom-cli";
}

function botStateRoot(bot: BotConfig): string {
  return path.join(stateRoot(), "bots", bot.id);
}

export function wecomRuntimeEnvironment(bot: BotConfig): NodeJS.ProcessEnv {
  const binaryDir = path.dirname(bot.cliPath || bundledWeComBinary());
  return {
    WECOM_CLI_CONFIG_DIR: path.join(botStateRoot(bot), "wecom-cli"),
    WECOM_CLI_LOG_DIR: path.join(botStateRoot(bot), "wecom-cli", "logs"),
    PATH: `${binaryDir}${path.delimiter}${process.env.PATH ?? ""}`
  };
}

export async function resolveWeComCommand(bot: BotConfig): Promise<{ command: string; prefix: string[] }> {
  if (bot.cliPath) return { command: bot.cliPath, prefix: [] };
  const binary = bundledWeComBinary();
  if (path.isAbsolute(binary)) await access(binary);
  return { command: binary, prefix: [] };
}

function wecomEnv(bot: BotConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...wecomRuntimeEnvironment(bot),
    ELECTRON_RUN_AS_NODE: "1",
    QUARKFANTOOLS_WECOM_CORP_SECRET: bot.appSecret
  };
}

export async function prepareWeComConfig(bot: BotConfig): Promise<void> {
  const dir = path.join(botStateRoot(bot), "wecom-cli");
  await mkdir(dir, { recursive: true });
  await resolveWeComCommand(bot);
}

export class WeComEventStream extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private stopping: Promise<void> | null = null;
  private connected = false;
  private bot: BotConfig | null = null;

  async start(bot: BotConfig): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.child) throw new Error("企业微信事件监听已在运行");
    await prepareWeComConfig(bot);
    await stopRecordedSubscriber(bot);
    const bridgeCommand = wecomEventBridgeCommand(bot);
    if (!bridgeCommand) {
      throw new Error("官方 wecom-cli 是调用型工具，不提供事件长连接；请在 providerOptions.eventCommand 配置输出 NDJSON 的企业微信事件桥，或等待后续内置回调/轮询服务。");
    }
    const child = spawn("/bin/zsh", ["-lc", bridgeCommand], {
      cwd: projectRoot(),
      env: wecomEnv(bot),
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.bot = bot;
    this.child = child;
    if (child.pid) {
      await writeFile(subscriberPidPath(bot), `${child.pid}\n`, { encoding: "utf8", mode: 0o600 });
    }
    child.stdout?.on("data", (chunk) => this.consume(String(chunk)));
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (!this.connected && /Connected\.|connected|listening/i.test(text)) {
        this.connected = true;
        this.emit("connected");
      }
      if (text) this.emit("stderr", text);
    });
    child.on("exit", (code, signal) => {
      this.child = null;
      this.connected = false;
      void removeRecordedSubscriber(bot, child.pid);
      this.emit("exit", { code, signal });
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    const bot = this.bot;
    this.stopping = (async () => {
      if (child) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          child.kill("SIGTERM");
        });
      }
      if (bot) await removeRecordedSubscriber(bot, child?.pid);
    })().finally(() => {
      if (!child || this.child === child) this.child = null;
      if (this.bot === bot) this.bot = null;
      this.stopping = null;
    });
    return this.stopping;
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = normalizeWeComEvent(JSON.parse(line));
        if (message) this.emit("message", message);
      } catch (error) {
        this.emit("stderr", `无法解析企业微信事件: ${String(error)}`);
      }
    }
  }
}

function subscriberPidPath(bot: BotConfig): string {
  return path.join(botStateRoot(bot), "wecom-event-subscriber.pid");
}

async function removeRecordedSubscriber(bot: BotConfig, expectedPid?: number): Promise<void> {
  if (expectedPid) {
    const recorded = Number((await readFile(subscriberPidPath(bot), "utf8").catch(() => "")).trim());
    if (recorded && recorded !== expectedPid) return;
  }
  await rm(subscriberPidPath(bot), { force: true });
}

async function stopRecordedSubscriber(bot: BotConfig): Promise<void> {
  const pid = Number((await readFile(subscriberPidPath(bot), "utf8").catch(() => "")).trim());
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
    await removeRecordedSubscriber(bot);
    return;
  }
  const command = await processCommand(pid);
  if (!isWeComEventSubscribeCommand(command)) {
    await removeRecordedSubscriber(bot);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await removeRecordedSubscriber(bot);
    return;
  }
}

async function processCommand(pid: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const child = spawn("/bin/ps", ["-p", String(pid), "-o", "command="], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.on("error", () => resolve(""));
    child.on("exit", (code) => resolve(code === 0 ? output.trim() : ""));
  });
}

export async function replyToWeComMessage(bot: BotConfig, messageId: string, text: string): Promise<void> {
  await runWeComMethod(bot, "msg", "send_message", { msg_id: messageId, content: text });
}

export async function sendWeComTextToChat(bot: BotConfig, chatId: string, text: string): Promise<void> {
  await runWeComMethod(bot, "msg", "send_message", { chat_id: chatId, content: text });
}

export async function sendWeComCardToUser(bot: BotConfig, userId: string, card: unknown, idempotencyKey: string): Promise<void> {
  await runWeComMethod(bot, "msg", "send_message", { user_id: userId, msg_type: "text", content: JSON.stringify(card), idempotency_key: idempotencyKey });
}

export async function downloadWeComMessageResources(bot: BotConfig, message: ChatMessage, outputDir: string): Promise<ChatMessage> {
  if (message.resources.length === 0) return message;
  await mkdir(outputDir, { recursive: true });
  const resources: ChatMessageResource[] = [];
  for (const resource of message.resources) {
    const cached = await materializeCachedMessageResource(bot, resource, outputDir);
    if (cached) {
      resources.push(cached);
      continue;
    }
    await runWeComMethod(bot, "msg", "get_msg_media", {
      sdk_file_id: resource.key,
      file_path: path.join(outputDir, resource.key)
    }, outputDir);
    const fileName = (await readdir(outputDir)).find((entry) => entry === resource.key || entry.startsWith(`${resource.key}.`));
    if (!fileName) throw new Error(`企业微信资源下载完成，但未找到文件: ${resource.key}`);
    const downloaded = { ...resource, localPath: path.join(outputDir, fileName) };
    await cacheDownloadedMessageResource(bot, downloaded);
    resources.push(downloaded);
  }
  return { ...message, resources };
}

async function runWeComCapture(bot: BotConfig, args: string[], cwd = projectRoot()): Promise<string> {
  await prepareWeComConfig(bot);
  const { command, prefix } = await resolveWeComCommand(bot);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd,
      env: wecomEnv(bot),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let error = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (error += String(chunk)));
    child.on("exit", (code) => (
      code === 0
        ? resolve(output.trim())
        : reject(new Error([error, output].filter(Boolean).join("\n") || `wecom-cli exited ${code}`))
    ));
  });
}

async function runWeComMethod(bot: BotConfig, category: string, method: string, payload: unknown, cwd = projectRoot()): Promise<string> {
  return runWeComCapture(bot, wecomMethodArgs(category, method, payload), cwd);
}
