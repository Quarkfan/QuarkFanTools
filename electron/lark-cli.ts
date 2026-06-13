import { app, shell } from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { projectRoot, stateRoot } from "./paths.js";
import type { BotConfig, LarkMessage } from "./types.js";
import { normalizeLarkEvent } from "./lark-event.js";

function bundledLarkBinary(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime", "lark-cli", "bin", "lark-cli")
    : path.join(projectRoot(), "node_modules", "@larksuite", "cli", "bin", "lark-cli");
}

export function larkRuntimeEnvironment(bot: BotConfig): NodeJS.ProcessEnv {
  const binaryDir = path.dirname(bot.cliPath || bundledLarkBinary());
  return {
    LARKSUITE_CLI_CONFIG_DIR: path.join(botStateRoot(bot), "lark-cli"),
    LARKSUITE_CLI_LOG_DIR: path.join(botStateRoot(bot), "lark-cli", "logs"),
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
    PATH: `${binaryDir}${path.delimiter}${process.env.PATH ?? ""}`
  };
}

export async function resolveLarkCommand(bot: BotConfig): Promise<{ command: string; prefix: string[] }> {
  if (bot.cliPath) {
    return { command: bot.cliPath, prefix: [] };
  }
  const binary = bundledLarkBinary();
  await access(binary);
  return { command: binary, prefix: [] };
}

function botStateRoot(bot: BotConfig): string {
  return path.join(stateRoot(), "bots", bot.id);
}

function larkEnv(bot: BotConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...larkRuntimeEnvironment(bot),
    ELECTRON_RUN_AS_NODE: "1",
    QUARKFANTOOLS_LARK_APP_SECRET: bot.appSecret
  };
}

export async function prepareLarkConfig(bot: BotConfig): Promise<void> {
  const dir = path.join(botStateRoot(bot), "lark-cli");
  await mkdir(dir, { recursive: true });
  if (!bot.appId) return;
  const markerPath = path.join(dir, ".quarkfantools-credential");
  const marker = createHash("sha256").update(`${bot.appId}:${bot.appSecret}`).digest("hex");
  if ((await readFile(markerPath, "utf8").catch(() => "")) === marker) return;
  const { command, prefix } = await resolveLarkCommand(bot);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...profileArgs(bot), "config", "init", "--app-id", bot.appId, "--app-secret-stdin", "--brand", "feishu"], {
      cwd: projectRoot(),
      env: larkEnv(bot),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (output += String(chunk)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(output || `lark-cli config init exited ${code}`))));
    child.stdin?.end(`${bot.appSecret}\n`);
  });
  await writeFile(markerPath, marker, { encoding: "utf8", mode: 0o600 });
}

function profileArgs(bot: BotConfig): string[] {
  return bot.profile ? ["--profile", bot.profile] : [];
}

export class LarkEventStream extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private stopping: Promise<void> | null = null;
  private connected = false;

  async start(bot: BotConfig): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.child) throw new Error("飞书事件监听已在运行");
    await prepareLarkConfig(bot);
    const { command, prefix } = await resolveLarkCommand(bot);
    const args = [
      ...prefix,
      ...profileArgs(bot),
      "event",
      "+subscribe",
      "--as",
      bot.receiveIdentity,
      "--event-types",
      bot.eventTypes.join(","),
      "--format",
      "ndjson"
    ];
    const child = spawn(command, args, {
      cwd: projectRoot(),
      env: larkEnv(bot),
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child = child;
    child.stdout?.on("data", (chunk) => this.consume(String(chunk)));
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (!this.connected && /Connected\.|connected to wss:\/\//i.test(text)) {
        this.connected = true;
        this.emit("connected");
      }
      if (text) this.emit("stderr", text);
    });
    child.on("exit", (code, signal) => {
      this.child = null;
      this.connected = false;
      this.emit("exit", { code, signal });
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    if (!child) return;
    this.stopping = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill("SIGTERM");
    }).finally(() => {
      if (this.child === child) this.child = null;
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
        const message = normalizeLarkEvent(JSON.parse(line));
        if (message) this.emit("message", message);
      } catch (error) {
        this.emit("stderr", `无法解析飞书事件: ${String(error)}`);
      }
    }
  }
}

export async function replyToMessage(bot: BotConfig, messageId: string, text: string): Promise<void> {
  await prepareLarkConfig(bot);
  const { command, prefix } = await resolveLarkCommand(bot);
  const args = [
    ...prefix,
    ...profileArgs(bot),
    "im",
    "+messages-reply",
    "--message-id",
    messageId,
    text.length > 100 ? "--markdown" : "--text",
    text,
    "--as",
    bot.replyIdentity,
    "--format",
    "json"
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot(), env: larkEnv(bot) });
    let error = "";
    child.stderr.on("data", (chunk) => (error += String(chunk)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(error || `lark-cli exited ${code}`))));
  });
}

export async function addMessageReaction(bot: BotConfig, messageId: string, emojiType: string): Promise<string> {
  await prepareLarkConfig(bot);
  const output = await runLarkCapture(bot, [
    "im",
    "reactions",
    "create",
    "--as",
    bot.replyIdentity,
    "--params",
    JSON.stringify({ message_id: messageId }),
    "--data",
    JSON.stringify({ reaction_type: { emoji_type: emojiType } }),
    "--format",
    "json"
  ]);
  const result = JSON.parse(output) as unknown;
  const reactionId = findString(result, (key) => key === "reaction_id");
  if (!reactionId) throw new Error(`飞书未返回 reaction_id: ${output}`);
  return reactionId;
}

export async function removeMessageReaction(bot: BotConfig, messageId: string, reactionId: string): Promise<void> {
  await prepareLarkConfig(bot);
  await runLarkCapture(bot, [
    "im",
    "reactions",
    "delete",
    "--as",
    bot.replyIdentity,
    "--params",
    JSON.stringify({ message_id: messageId, reaction_id: reactionId }),
    "--format",
    "json"
  ]);
}

async function runLarkCapture(bot: BotConfig, args: string[]): Promise<string> {
  const { command, prefix } = await resolveLarkCommand(bot);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...profileArgs(bot), ...args], {
      cwd: projectRoot(),
      env: larkEnv(bot),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let error = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (error += String(chunk)));
    child.on("exit", (code) => (
      code === 0
        ? resolve(output.trim())
        : reject(new Error([error, output].filter(Boolean).join("\n") || `lark-cli exited ${code}`))
    ));
  });
}

function findString(value: unknown, predicate: (key: string, value: string) => boolean): string {
  if (!value || typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && predicate(key, child)) return child;
    const nested = findString(child, predicate);
    if (nested) return nested;
  }
  return "";
}

export async function loginLarkUser(bot: BotConfig): Promise<string> {
  await prepareLarkConfig(bot);
  const initiated = await runLarkCapture(bot, ["auth", "login", "--recommend", "--no-wait", "--json"]);
  const result = JSON.parse(initiated) as unknown;
  const verificationUrl = findString(result, (key, value) => /url|uri/i.test(key) && /^https?:\/\//.test(value));
  const deviceCode = findString(result, (key) => /device.?code/i.test(key));
  if (!verificationUrl || !deviceCode) {
    throw new Error(`无法读取飞书 OAuth 授权链接或设备码: ${initiated}`);
  }
  await shell.openExternal(verificationUrl);
  return runLarkCapture(bot, ["auth", "login", "--device-code", deviceCode, "--json"]);
}
