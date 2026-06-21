import electron from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { botLarkHomeRoot, projectRoot, stateRoot } from "./paths.js";
import type { BotConfig, LarkBotIdentity, LarkMessage, LarkMessageResource } from "./types.js";
import { normalizeLarkEvent } from "./lark-event.js";
import { filterLarkEventStderr, isLarkEventSubscribeCommand, larkEventSubscribeArgs, larkUserLoginArgs } from "./lark-commands.js";
import { normalizeLarkConfigProfilesContent } from "./lark-config-profiles.js";
import { effectiveBotProfile } from "./bot-identity.js";

const preparedCredentials = new Map<string, string>();
const LARK_CAPTURE_TIMEOUT_MS = 30_000;
const electronApp = typeof electron === "object" && electron && "app" in electron ? electron.app : null;
const electronShell = typeof electron === "object" && electron && "shell" in electron ? electron.shell : null;

function bundledLarkBinary(): string {
  const packaged = electronApp?.isPackaged ?? process.env.QFT_IS_PACKAGED === "1";
  const resourcesPath = process.env.QFT_RESOURCES_PATH ?? process.resourcesPath ?? projectRoot();
  return packaged
    ? path.join(resourcesPath, "runtime", "lark-cli", "bin", "lark-cli")
    : path.join(projectRoot(), "node_modules", "@larksuite", "cli", "bin", "lark-cli");
}

export function larkRuntimeEnvironment(bot: BotConfig): NodeJS.ProcessEnv {
  const binaryDir = path.dirname(bot.cliPath || bundledLarkBinary());
  const botHome = botLarkHomeRoot(bot.id);
  const botRoot = botStateRoot(bot);
  return {
    HOME: botHome,
    TMPDIR: path.join(botRoot, "tmp"),
    LARKSUITE_CLI_CONFIG_DIR: path.join(botRoot, "lark-cli"),
    LARKSUITE_CLI_LOG_DIR: path.join(botRoot, "lark-cli", "logs"),
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
  await Promise.all([
    mkdir(dir, { recursive: true }),
    mkdir(path.join(botStateRoot(bot), "tmp"), { recursive: true }),
    mkdir(botLarkHomeRoot(bot.id), { recursive: true })
  ]);
  if (!bot.appId) return;
  const markerPath = path.join(dir, ".quarkfantools-credential");
  const marker = createHash("sha256").update(`per-bot-home-v2:${botLarkHomeRoot(bot.id)}:${bot.appId}:${effectiveProfile(bot)}:${bot.appSecret}`).digest("hex");
  if (preparedCredentials.get(bot.id) === marker) return;
  if ((await readFile(markerPath, "utf8").catch(() => "")) === marker) {
    try {
      await normalizeLarkConfigProfiles(bot);
      await runLarkCaptureRaw(bot, ["config", "show"]);
      await prepareSandboxKeychain(bot);
      preparedCredentials.set(bot.id, marker);
      return;
    } catch {
      // The marker can outlive lark-cli keychain data. Reinitialize below.
    }
  }
  const { command, prefix } = await resolveLarkCommand(bot);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...profileArgs(bot), "config", "init", "--name", effectiveProfile(bot), "--app-id", bot.appId, "--app-secret-stdin", "--brand", "feishu"], {
      cwd: projectRoot(),
      env: larkEnv(bot),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`lark-cli config init timed out after ${LARK_CAPTURE_TIMEOUT_MS / 1000}s`));
    }, LARK_CAPTURE_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (output += String(chunk)));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(output || `lark-cli config init exited ${code}`));
    });
    child.stdin?.end(`${bot.appSecret}\n`);
  });
  await writeFile(markerPath, marker, { encoding: "utf8", mode: 0o600 });
  await normalizeLarkConfigProfiles(bot);
  await prepareSandboxKeychain(bot);
  preparedCredentials.set(bot.id, marker);
}

async function prepareSandboxKeychain(bot: BotConfig): Promise<void> {
  if (process.platform !== "darwin") return;
  await runLarkCaptureRaw(bot, ["config", "keychain-downgrade"]);
}

async function normalizeLarkConfigProfiles(bot: BotConfig): Promise<void> {
  const configPath = path.join(botStateRoot(bot), "lark-cli", "config.json");
  const raw = await readFile(configPath, "utf8").catch(() => "");
  const normalized = normalizeLarkConfigProfilesContent(raw, bot);
  if (normalized === null || normalized === raw) return;
  await writeFile(configPath, normalized, { encoding: "utf8", mode: 0o600 });
}

function profileArgs(bot: BotConfig): string[] {
  return ["--profile", effectiveBotProfile(bot)];
}

export function effectiveProfile(bot: BotConfig): string {
  return effectiveBotProfile(bot);
}

export class LarkEventStream extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private stopping: Promise<void> | null = null;
  private connected = false;
  private bot: BotConfig | null = null;

  async start(bot: BotConfig): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.child) throw new Error("飞书事件监听已在运行");
    await prepareLarkConfig(bot);
    await stopRecordedSubscriber(bot);
    const { command, prefix } = await resolveLarkCommand(bot);
    const args = [...prefix, ...larkEventSubscribeArgs(bot)];
    const child = spawn(command, args, {
      cwd: projectRoot(),
      env: larkEnv(bot),
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.bot = bot;
    this.child = child;
    if (child.pid) {
      try {
        await writeFile(subscriberPidPath(bot), `${child.pid}\n`, { encoding: "utf8", mode: 0o600 });
      } catch (error) {
        child.kill("SIGKILL");
        this.child = null;
        this.bot = null;
        throw error;
      }
    }
    child.stdout?.on("data", (chunk) => this.consume(String(chunk)));
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (!this.connected && /Connected\.|connected to wss:\/\//i.test(text)) {
        this.connected = true;
        this.emit("connected");
      }
      const relevant = filterLarkEventStderr(text);
      if (relevant) this.emit("stderr", relevant);
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
        const message = normalizeLarkEvent(JSON.parse(line));
        if (message) this.emit("message", message);
      } catch (error) {
        this.emit("stderr", `无法解析飞书事件: ${String(error)}`);
      }
    }
  }
}

function subscriberPidPath(bot: BotConfig): string {
  return path.join(botStateRoot(bot), "lark-event-subscriber.pid");
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
  if (!isLarkEventSubscribeCommand(command)) {
    await removeRecordedSubscriber(bot);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await removeRecordedSubscriber(bot);
    return;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!(await processCommand(pid))) {
      await removeRecordedSubscriber(bot);
      return;
    }
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The subscriber exited between the last check and the kill.
  }
  await removeRecordedSubscriber(bot);
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

export async function sendCardToUser(bot: BotConfig, userOpenId: string, card: unknown, idempotencyKey: string): Promise<void> {
  await prepareLarkConfig(bot);
  await runLarkCapture(bot, [
    "im",
    "+messages-send",
    "--as",
    bot.replyIdentity,
    "--user-id",
    userOpenId,
    "--msg-type",
    "interactive",
    "--content",
    JSON.stringify(card),
    "--idempotency-key",
    idempotencyKey,
    "--format",
    "json"
  ]);
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

export async function getLarkBotIdentity(bot: BotConfig): Promise<LarkBotIdentity> {
  const output = await runLarkCapture(bot, [
    "api",
    "GET",
    "/open-apis/bot/v3/info",
    "--as",
    "bot",
    "--format",
    "json"
  ]);
  const result = JSON.parse(output) as any;
  const openId = typeof result?.bot?.open_id === "string" ? result.bot.open_id : "";
  if (!openId) throw new Error(`飞书未返回 Bot open_id: ${output}`);
  return {
    openId,
    appName: typeof result?.bot?.app_name === "string" ? result.bot.app_name : undefined
  };
}

export async function downloadMessageResources(bot: BotConfig, message: LarkMessage, outputDir: string): Promise<LarkMessage> {
  if (message.resources.length === 0) return message;
  await mkdir(outputDir, { recursive: true });
  const resources: LarkMessageResource[] = [];
  for (const resource of message.resources) {
    await runLarkCapture(bot, [
      "im",
      "+messages-resources-download",
      "--as",
      bot.receiveIdentity,
      "--message-id",
      message.messageId,
      "--file-key",
      resource.key,
      "--type",
      resource.type,
      "--output",
      resource.key,
      "--format",
      "json"
    ], outputDir);
    const fileName = (await readdir(outputDir)).find((entry) => entry === resource.key || entry.startsWith(`${resource.key}.`));
    if (!fileName) throw new Error(`飞书资源下载完成，但未找到文件: ${resource.key}`);
    resources.push({ ...resource, localPath: path.join(outputDir, fileName) });
  }
  return { ...message, resources };
}

async function runLarkCapture(bot: BotConfig, args: string[], cwd = projectRoot()): Promise<string> {
  await prepareLarkConfig(bot);
  return runLarkCaptureRaw(bot, args, cwd);
}

async function runLarkCaptureRaw(bot: BotConfig, args: string[], cwd = projectRoot()): Promise<string> {
  const { command, prefix } = await resolveLarkCommand(bot);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...profileArgs(bot), ...args], {
      cwd,
      env: larkEnv(bot),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let error = "";
    let settled = false;
    const displayArgs = [...profileArgs(bot), ...args].join(" ");
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`lark-cli ${displayArgs} timed out after ${LARK_CAPTURE_TIMEOUT_MS / 1000}s`));
    }, LARK_CAPTURE_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (error += String(chunk)));
    child.on("error", (spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(spawnError);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      code === 0
        ? resolve(output.trim())
        : reject(new Error([error, output].filter(Boolean).join("\n") || `lark-cli exited ${code}`));
    });
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
  const initiated = await runLarkCapture(bot, larkUserLoginArgs(bot.oauthScopes));
  const result = JSON.parse(initiated) as unknown;
  const verificationUrl = findString(result, (key, value) => /url|uri/i.test(key) && /^https?:\/\//.test(value));
  const deviceCode = findString(result, (key) => /device.?code/i.test(key));
  if (!verificationUrl || !deviceCode) {
    throw new Error(`无法读取飞书 OAuth 授权链接或设备码: ${initiated}`);
  }
  if (!electronShell) throw new Error("当前运行环境无法打开飞书 OAuth 授权页面");
  await electronShell.openExternal(verificationUrl);
  return runLarkCapture(bot, ["auth", "login", "--device-code", deviceCode, "--json"]);
}
