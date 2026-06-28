import electron from "electron";
import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheDownloadedMessageResource, materializeCachedMessageResource } from "./file-cache.js";
import { projectRoot, stateRoot } from "./paths.js";
import type { BotConfig, ChatMessage, ChatMessageResource, WeComChatListItem, WeComChatListResult } from "./types.js";
import { isWeComEventSubscribeCommand, wecomEventBridgeCommand, wecomMethodArgs } from "./wecom-commands.js";
import { normalizeWeComEvent } from "./wecom-event.js";

const { app } = electron;
const WECOM_MCP_CONFIG_ENDPOINT = "https://qyapi.weixin.qq.com/cgi-bin/aibot/cli/get_mcp_config";

export interface WeComInitResult {
  output: string;
  mcpConfigCount: number;
}

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

export async function hasWeComCliConfig(bot: BotConfig): Promise<boolean> {
  const dir = path.join(botStateRoot(bot), "wecom-cli");
  try {
    await Promise.all([
      access(path.join(dir, "bot.enc")),
      access(path.join(dir, "mcp_config.enc"))
    ]);
    return true;
  } catch {
    return false;
  }
}

export function isWeComCliNeedsInitError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  return /未找到(MCP 配置缓存|企业微信机器人信息)|请先运行 [`']?wecom-cli init[`']?|init --noninteractive/i.test(message);
}

export function friendlyWeComCliError(error: unknown): Error {
  if (isWeComCliNeedsInitError(error)) {
    return new Error("企业微信 CLI 尚未初始化。请在该 Bot 的配置弹窗中点击“初始化/刷新企业微信 CLI 缓存”，应用会使用当前 Bot 配置的企业微信 Bot ID / Secret 生成官方 CLI 缓存。");
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function initializeWeComCli(bot: BotConfig): Promise<WeComInitResult> {
  await prepareWeComConfig(bot);
  const botId = bot.appId.trim();
  const botSecret = bot.appSecret.trim();
  if (!botId || !botSecret) throw new Error("请先填写企业微信 Bot ID 和 Bot Secret。");
  const configDir = path.join(botStateRoot(bot), "wecom-cli");
  const key = await loadOrCreateWeComEncryptionKey(configDir);
  const now = Math.floor(Date.now() / 1000);
  await writeEncryptedJson(path.join(configDir, "bot.enc"), {
    id: botId,
    secret: botSecret,
    create_time: now
  }, key);
  const response = await fetchWeComMcpConfig(botId, botSecret, now);
  await writeEncryptedJson(path.join(configDir, "mcp_config.enc"), response.list, key);
  return {
    output: `已使用当前 Bot ID / Secret 初始化官方 wecom-cli 缓存，获得 ${response.list.length} 项 MCP 配置。`,
    mcpConfigCount: response.list.length
  };
}

export async function fetchWeComChatList(bot: BotConfig, now = new Date()): Promise<WeComChatListResult> {
  if (!(await hasWeComCliConfig(bot))) {
    throw friendlyWeComCliError(new Error("未找到 MCP 配置缓存，请先运行 `wecom-cli init`"));
  }
  const endTime = formatWeComDateTime(now);
  const beginTime = formatWeComDateTime(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const output = await runWeComMethod(bot, "msg", "get_msg_chat_list", { begin_time: beginTime, end_time: endTime });
  return {
    beginTime,
    endTime,
    chats: extractWeComChatListFromOutput(output),
    output
  };
}

async function loadOrCreateWeComEncryptionKey(configDir: string): Promise<Buffer> {
  const keyPath = path.join(configDir, ".encryption_key");
  const existing = await readFile(keyPath, "utf8").catch(() => "");
  if (existing.trim()) {
    const key = Buffer.from(existing.trim(), "base64");
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  await writeFile(keyPath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return key;
}

async function writeEncryptedJson(filePath: string, value: unknown, key: Buffer): Promise<void> {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeFile(filePath, Buffer.concat([nonce, encrypted, tag]), { mode: 0o600 });
}

async function fetchWeComMcpConfig(botId: string, botSecret: string, time: number): Promise<{ list: unknown[] }> {
  const nonce = `mcp_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const signature = createHash("sha256").update(`${botSecret}${botId}${time}${nonce}`).digest("hex");
  const response = await fetch(WECOM_MCP_CONFIG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `WeComCLI/quarkfantools distribution/quarkfantools ${process.platform}/${process.arch}`
    },
    body: JSON.stringify({
      bot_id: botId,
      time,
      nonce,
      signature,
      bind_source: 1,
      cli_version: `WeComCLI/quarkfantools distribution/quarkfantools ${process.platform}/${process.arch}`
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`获取企业微信 MCP 配置失败：HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
  const payload = await response.json() as { errcode?: number; errmsg?: string; list?: unknown[] };
  if (payload.errcode !== 0) {
    throw new Error(`获取企业微信 MCP 配置失败：[${payload.errcode ?? "unknown"}] ${payload.errmsg ?? "unknown"}`);
  }
  if (!Array.isArray(payload.list) || payload.list.length === 0) {
    throw new Error("获取企业微信 MCP 配置失败：返回配置为空。");
  }
  return { list: payload.list };
}

export class WeComEventStream extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;
  private seenEventIds = new Set<string>();
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
      if (!(await hasWeComCliConfig(bot))) {
        throw friendlyWeComCliError(new Error("未找到 MCP 配置缓存，请先运行 `wecom-cli init`"));
      }
      this.startDefaultPollingBridge(bot);
      return;
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
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
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
      this.polling = false;
      this.connected = false;
      this.stopping = null;
    });
    return this.stopping;
  }

  private startDefaultPollingBridge(bot: BotConfig): void {
    this.bot = bot;
    this.connected = true;
    this.emit("connected");
    this.emit("stderr", "未配置自定义企业微信事件桥命令，已使用内置轮询桥：通过 wecom-cli msg get_message 定期拉取消息。");
    const intervalMs = Math.max(2000, Number(bot.providerOptions?.pollIntervalMs ?? 5000) || 5000);
    const poll = async () => {
      if (this.polling || !this.bot) return;
      this.polling = true;
      try {
        for (const payload of defaultPollingPayloads(bot)) {
          const output = await runWeComCapture(bot, wecomMethodArgs("msg", "get_message", payload));
          for (const item of extractWeComEventsFromOutput(output)) {
            const message = normalizeWeComEvent(item);
            if (!message) continue;
            const dedupeKey = message.eventId || message.messageId;
            if (this.seenEventIds.has(dedupeKey)) continue;
            this.seenEventIds.add(dedupeKey);
            if (this.seenEventIds.size > 1000) this.seenEventIds = new Set([...this.seenEventIds].slice(-500));
            this.emit("message", message);
          }
        }
      } catch (error) {
        this.emit("stderr", `企业微信内置轮询桥拉取失败: ${friendlyWeComCliError(error).message}`);
      } finally {
        this.polling = false;
      }
    };
    this.pollTimer = setInterval(() => void poll(), intervalMs);
    void poll();
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

export function defaultPollingPayload(bot: BotConfig, now = new Date()): Record<string, unknown> {
  return defaultPollingPayloads(bot, now)[0];
}

export function defaultPollingPayloads(bot: BotConfig, now = new Date()): Record<string, unknown>[] {
  const raw = bot.providerOptions?.pollPayload?.trim();
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
    } catch {
      throw new Error("企业微信内置轮询桥配置错误：高级 JSON 参数不是合法 JSON。");
    }
  }
  const targets = pollingTargets(bot, parsed);
  if (targets.length === 0) {
    throw new Error("企业微信内置轮询桥缺少轮询 Chat ID。请在该 Bot 的企业微信配置区填写一个或多个“轮询 Chat ID”，或配置自定义企业微信事件桥命令。");
  }
  const windowSeconds = normalizePollingWindowSeconds(parsed.window_seconds ?? bot.providerOptions?.pollWindowSeconds);
  const endTime = String(parsed.end_time ?? "").trim() || formatWeComDateTime(now);
  const beginTime = String(parsed.begin_time ?? "").trim() || formatWeComDateTime(new Date(now.getTime() - windowSeconds * 1000));
  return targets.map((target) => ({
    ...parsed,
    chat_type: target.chatType,
    chatid: target.chatid,
    begin_time: beginTime,
    end_time: endTime
  }));
}

function pollingTargets(bot: BotConfig, parsed: Record<string, unknown>): Array<{ chatType: 1 | 2; chatid: string }> {
  const parsedChatId = String(parsed.chatid ?? "").trim();
  if (parsedChatId) {
    return [{ chatType: normalizePollingChatType(parsed.chat_type ?? bot.providerOptions?.pollChatType), chatid: parsedChatId }];
  }
  const defaultChatType = normalizePollingChatType(bot.providerOptions?.pollChatType);
  return String(bot.providerOptions?.pollChatId ?? "")
    .split(/[\n,]+/)
    .map((item) => parsePollingTarget(item, defaultChatType))
    .filter((item): item is { chatType: 1 | 2; chatid: string } => Boolean(item));
}

function parsePollingTarget(value: string, defaultChatType: 1 | 2): { chatType: 1 | 2; chatid: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([12]|single|user|private|group|room|chat)\s*[:：]\s*(.+)$/i);
  if (!match) return { chatType: defaultChatType, chatid: trimmed };
  return {
    chatType: normalizePollingChatType(match[1]),
    chatid: match[2].trim()
  };
}

function normalizePollingChatType(value: unknown): 1 | 2 {
  const normalized = String(value ?? "2").trim().toLowerCase();
  if (["1", "single", "user", "private"].includes(normalized)) return 1;
  if (["2", "group", "room", "chat"].includes(normalized)) return 2;
  throw new Error("企业微信内置轮询桥配置错误：轮询会话类型只能是单聊(1)或群聊(2)。");
}

function normalizePollingWindowSeconds(value: unknown): number {
  const seconds = Math.floor(Number(value ?? 300));
  if (!Number.isFinite(seconds) || seconds <= 0) return 300;
  return Math.max(10, Math.min(7 * 24 * 60 * 60, seconds));
}

function formatWeComDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(":");
}

export function extractWeComEventsFromOutput(output: string): unknown[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const parsed = parseJsonMaybe(trimmed);
  if (parsed !== undefined) return flattenWeComEventPayload(parsed);
  return trimmed
    .split(/\r?\n/)
    .map((line) => parseJsonMaybe(line.trim()))
    .filter((item): item is unknown => item !== undefined)
    .flatMap((item) => flattenWeComEventPayload(item));
}

export function extractWeComChatListFromOutput(output: string): WeComChatListItem[] {
  const values = parseWeComOutputValues(output);
  const seen = new Set<string>();
  const result: WeComChatListItem[] = [];
  for (const value of values) {
    for (const item of flattenWeComChatListPayload(value)) {
      const chatId = String(item.chat_id ?? item.chatid ?? item.chatId ?? "").trim();
      if (!chatId || seen.has(chatId)) continue;
      seen.add(chatId);
      const msgCount = Number(item.msg_count ?? item.msgCount ?? 0);
      result.push({
        chatId,
        chatName: String(item.chat_name ?? item.chatName ?? item.name ?? "").trim() || undefined,
        lastMsgTime: String(item.last_msg_time ?? item.lastMsgTime ?? item.last_time ?? "").trim() || undefined,
        msgCount: Number.isFinite(msgCount) && msgCount > 0 ? msgCount : undefined
      });
    }
  }
  return result;
}

function parseWeComOutputValues(output: string): unknown[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const parsed = parseJsonMaybe(trimmed);
  if (parsed !== undefined) return unwrapWeComRpcText(parsed).flatMap((item) => parseWeComOutputValues(item)).concat(parsed);
  return trimmed
    .split(/\r?\n/)
    .map((line) => parseJsonMaybe(line.trim()))
    .filter((item): item is unknown => item !== undefined)
    .flatMap((item) => unwrapWeComRpcText(item).flatMap((text) => parseWeComOutputValues(text)).concat(item));
}

function unwrapWeComRpcText(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const content = (value as Record<string, unknown>).result && typeof (value as Record<string, unknown>).result === "object"
    ? ((value as Record<string, unknown>).result as Record<string, unknown>).content
    : undefined;
  if (!Array.isArray(content)) return [];
  return content
    .map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>).text ?? "").trim() : "")
    .filter(Boolean);
}

function parseJsonMaybe(text: string): unknown | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function flattenWeComEventPayload(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenWeComEventPayload(item));
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["messages", "message_list", "msg_list", "items", "list", "data"]) {
    const child = record[key];
    if (Array.isArray(child)) return child.flatMap((item) => flattenWeComEventPayload(item));
    if (child && typeof child === "object" && child !== value) {
      const nested = flattenWeComEventPayload(child);
      if (nested.length) return nested;
    }
  }
  return [value];
}

function flattenWeComChatListPayload(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenWeComChatListPayload(item));
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["chats", "chat_list", "items", "list", "data"]) {
    const child = record[key];
    if (Array.isArray(child)) return child.flatMap((item) => flattenWeComChatListPayload(item));
    if (child && typeof child === "object" && child !== value) {
      const nested = flattenWeComChatListPayload(child);
      if (nested.length) return nested;
    }
  }
  return record.chat_id || record.chatid || record.chatId ? [record] : [];
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
        : reject(friendlyWeComCliError(new Error([error, output].filter(Boolean).join("\n") || `wecom-cli exited ${code}`)))
    ));
  });
}

async function runWeComMethod(bot: BotConfig, category: string, method: string, payload: unknown, cwd = projectRoot()): Promise<string> {
  return runWeComCapture(bot, wecomMethodArgs(category, method, payload), cwd);
}
