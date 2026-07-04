import electron from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { accessSync, constants } from "node:fs";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { botLarkHomeRoot, projectRoot, stateRoot } from "./paths.js";
import type { BotConfig, LarkBotIdentity, LarkMessage, LarkMessageResource } from "./types.js";
import { normalizeLarkEvent } from "./lark-event.js";
import { filterLarkEventStderr, isLarkEventSubscribeCommand, larkEventSubscribeArgs, larkUserLoginArgs } from "./lark-commands.js";
import { cacheDownloadedLarkFile, cacheDownloadedMessageResource, materializeCachedLarkFile, materializeCachedMessageResource, type LarkFileCacheRequest } from "./file-cache.js";
import type { LarkCachedFileRequest } from "./lark-cached-file-protocol.js";
import { effectiveBotProfile } from "./bot-identity.js";

const { app, shell } = electron;

const preparedCredentials = new Map<string, string>();
const LARK_CAPTURE_TIMEOUT_MS = 30_000;

function bundledLarkBinary(): string {
  return app?.isPackaged
    ? path.join(process.resourcesPath, "runtime", "lark-cli", "bin", "lark-cli")
    : path.join(projectRoot(), "node_modules", "@larksuite", "cli", "bin", "lark-cli");
}

function isExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function localLarkBinary(): string | null {
  const candidates = [
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, "lark-cli")),
    "/opt/homebrew/bin/lark-cli",
    "/usr/local/bin/lark-cli"
  ];
  const bundled = path.resolve(bundledLarkBinary());
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (seen.has(normalized) || normalized === bundled) continue;
    seen.add(normalized);
    if (isExecutableFile(normalized)) return normalized;
  }
  return null;
}

function preferredLarkBinary(bot: BotConfig): string {
  if (bot.cliPath) return bot.cliPath;
  return localLarkBinary() ?? bundledLarkBinary();
}

export function larkRuntimeEnvironment(bot: BotConfig): NodeJS.ProcessEnv {
  const binaryDir = path.dirname(preferredLarkBinary(bot));
  const botHome = botLarkHomeRoot(bot.id);
  return {
    HOME: botHome,
    LARKSUITE_CLI_CONFIG_DIR: path.join(botStateRoot(bot), "lark-cli"),
    LARKSUITE_CLI_LOG_DIR: path.join(botStateRoot(bot), "lark-cli", "logs"),
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
    PATH: `${binaryDir}${path.delimiter}${process.env.PATH ?? ""}`
  };
}

export async function resolveLarkCommand(bot: BotConfig): Promise<{ command: string; prefix: string[] }> {
  const binary = preferredLarkBinary(bot);
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

export function normalizeLarkConfigProfilesContent(raw: string, bot: BotConfig): string | null {
  if (!raw.trim()) return null;
  let parsed: { apps?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.apps)) return null;
  const profile = effectiveProfile(bot);
  const matchingApps = parsed.apps.filter((appItem) => appItem.appId === bot.appId);
  const named = matchingApps.find((appItem) => appItem.name === profile);
  const fallback = named ?? matchingApps[0];
  if (!fallback) return null;
  const normalized = { ...fallback, name: profile };
  const otherApps = parsed.apps.filter((appItem) => appItem.appId !== bot.appId);
  return `${JSON.stringify({ ...parsed, apps: [...otherApps, normalized] }, null, 2)}\n`;
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

export async function sendTextToChat(bot: BotConfig, chatId: string, text: string, replyIdentity?: "bot" | "user"): Promise<void> {
  await prepareLarkConfig(bot);
  await runLarkCapture(bot, [
    "im",
    "+messages-send",
    "--as",
    replyIdentity ?? bot.replyIdentity,
    "--chat-id",
    chatId,
    text.length > 100 ? "--markdown" : "--text",
    text,
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
    "--message-id",
    messageId,
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
    "--message-id",
    messageId,
    "--reaction-id",
    reactionId,
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
  const result = JSON.parse(output) as unknown;
  const identity = parseLarkBotIdentity(result);
  if (!identity.openId && !larkApiSucceeded(result)) throw new Error(`飞书未返回 Bot open_id: ${output}`);
  if (!identity.openId && larkApiSucceeded(result)) {
    const directIdentity = await getLarkBotIdentityFromOpenApi(bot).catch((): LarkBotIdentity => ({}));
    if (directIdentity.openId) {
      return {
        appName: directIdentity.appName ?? bot.name,
        openId: directIdentity.openId
      };
    }
  }
  return {
    appName: identity.appName ?? bot.name,
    openId: identity.openId
  };
}

export function parseLarkBotIdentity(result: unknown): LarkBotIdentity {
  const openId = findString(result, (key) => /^open_?id$/i.test(key));
  const appName = findString(result, (key) => /^app_?name$/i.test(key) || /^name$/i.test(key));
  const identity: LarkBotIdentity = {};
  if (appName) identity.appName = appName;
  if (openId) identity.openId = openId;
  return identity;
}

function larkApiSucceeded(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const ok = (result as { ok?: unknown }).ok;
  const code = (result as { code?: unknown }).code;
  return ok === true || code === 0;
}

export async function getLarkBotIdentityFromOpenApi(bot: BotConfig): Promise<LarkBotIdentity> {
  const tokenResponse = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: bot.appId,
      app_secret: bot.appSecret
    })
  });
  const tokenResult = await tokenResponse.json() as unknown;
  const tenantAccessToken = findString(tokenResult, (key) => key === "tenant_access_token");
  if (!tenantAccessToken) throw new Error("飞书未返回 tenant_access_token");

  const botResponse = await fetch("https://open.feishu.cn/open-apis/bot/v3/info", {
    method: "GET",
    headers: {
      authorization: `Bearer ${tenantAccessToken}`,
      "content-type": "application/json; charset=utf-8"
    }
  });
  const botResult = await botResponse.json() as unknown;
  const identity = parseLarkBotIdentity(botResult);
  if (!identity.openId) throw new Error("飞书原始 Bot info 未返回 open_id");
  return identity;
}

export async function downloadMessageResources(bot: BotConfig, message: LarkMessage, outputDir: string): Promise<LarkMessage> {
  if (message.resources.length === 0) return message;
  await mkdir(outputDir, { recursive: true });
  const resources: LarkMessageResource[] = [];
  for (const resource of message.resources) {
    const cached = await materializeCachedMessageResource(bot, resource, outputDir);
    if (cached) {
      resources.push(cached);
      continue;
    }
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
    const downloaded = { ...resource, localPath: path.join(outputDir, fileName) };
    await cacheDownloadedMessageResource(bot, downloaded);
    resources.push(downloaded);
  }
  return { ...message, resources };
}

export async function listLarkChatMessages(bot: BotConfig, chatId: string, startIso: string, limit: number): Promise<LarkMessage[]> {
  const messages: LarkMessage[] = [];
  let pageToken = "";
  const seenPageTokens = new Set<string>();
  while (messages.length < limit) {
    const args = [
      "im",
      "+chat-messages-list",
      "--as",
      bot.receiveIdentity,
      "--chat-id",
      chatId,
      "--start",
      startIso,
      "--order",
      "asc",
      "--page-size",
      String(Math.max(1, Math.min(50, limit - messages.length))),
      "--no-reactions",
      "--format",
      "json"
    ];
    if (pageToken) args.push("--page-token", pageToken);
    const output = await runLarkCapture(bot, args);
    const parsed = JSON.parse(output) as unknown;
    const pageMessages = extractHistoryMessageRecords(parsed, chatId)
      .map((record) => historyRecordToMessage(record, chatId))
      .filter((message): message is LarkMessage => Boolean(message));
    messages.push(...pageMessages);
    pageToken = findNextPageToken(parsed);
    if (pageToken && seenPageTokens.has(pageToken)) break;
    if (pageToken) seenPageTokens.add(pageToken);
    if (!pageToken || pageMessages.length === 0) break;
  }
  return messages.slice(0, limit);
}

function extractHistoryMessageRecords(value: unknown, chatId: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const record = item as Record<string, unknown>;
    if (typeof (record.message_id ?? record.messageId) === "string") {
      const recordChatId = firstString(record.chat_id, record.chatId);
      if (!recordChatId || recordChatId === chatId) result.push(record);
      return;
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return result;
}

function historyRecordToMessage(record: Record<string, unknown>, chatId: string): LarkMessage | null {
  const messageId = firstString(record.message_id, record.messageId);
  if (!messageId) return null;
  const sender = record.sender && typeof record.sender === "object" ? record.sender as Record<string, unknown> : {};
  const senderIdRecord = sender.sender_id && typeof sender.sender_id === "object" ? sender.sender_id as Record<string, unknown> : sender;
  const messageType = firstString(record.message_type, record.messageType, record.msg_type, record.msgType) ?? "text";
  const content = typeof record.content === "string" ? record.content : JSON.stringify(record.content ?? {});
  return normalizeLarkEvent({
    header: {
      event_id: firstString(record.event_id, record.eventId) ?? `history:${messageId}`,
      create_time: firstScalar(record.create_time, record.createTime, record.created_at, record.createdAt, record.update_time, record.updateTime)
    },
    event: {
      sender: { sender_id: senderIdRecord },
      message: {
        message_id: messageId,
        chat_id: firstString(record.chat_id, record.chatId) ?? chatId,
        chat_type: firstString(record.chat_type, record.chatType) ?? inferChatTypeFromChatId(chatId),
        message_type: messageType,
        content,
        mentions: Array.isArray(record.mentions) ? record.mentions : undefined
      }
    }
  });
}

function firstScalar(...values: unknown[]): string | undefined {
  const value = values.find((item) => (typeof item === "string" && item.length > 0) || typeof item === "number");
  return value === undefined ? undefined : String(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function findNextPageToken(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findNextPageToken(item);
      if (nested) return nested;
    }
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const key of ["page_token", "pageToken", "next_page_token", "nextPageToken"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  for (const child of Object.values(record)) {
    const nested = findNextPageToken(child);
    if (nested) return nested;
  }
  return "";
}

function inferChatTypeFromChatId(chatId: string): string {
  return chatId.startsWith("oc_") ? "group" : "p2p";
}

export async function materializeLarkCachedFile(bot: BotConfig, request: LarkCachedFileRequest, outputDir: string): Promise<{ localPath: string; cacheHit: boolean }> {
  await mkdir(outputDir, { recursive: true });
  const cacheRequest = larkFileCacheRequest(request);
  const cached = await materializeCachedLarkFile(bot, cacheRequest, outputDir);
  if (cached) return { localPath: cached, cacheHit: true };

  const outputName = cacheRequest.outputName || defaultLarkOutputName(request);
  if (request.action === "drive-export") {
    await runLarkCapture(bot, [
      "drive",
      "+export",
      "--as",
      "user",
      "--token",
      request.fileToken,
      "--doc-type",
      request.docType!,
      "--file-extension",
      request.fileExtension!,
      "--file-name",
      outputName,
      "--output-dir",
      ".",
      "--format",
      "json"
    ], outputDir);
  } else {
    await runLarkCapture(bot, [
      "drive",
      "+download",
      "--as",
      "user",
      "--file-token",
      request.fileToken,
      "--output",
      outputName,
      "--format",
      "json"
    ], outputDir);
  }
  const localPath = path.join(outputDir, outputName);
  await access(localPath);
  await cacheDownloadedLarkFile(bot, { ...cacheRequest, outputName }, localPath);
  return { localPath, cacheHit: false };
}

function larkFileCacheRequest(request: LarkCachedFileRequest): LarkFileCacheRequest {
  return {
    type: request.action === "drive-export" ? "lark-drive-export" : "lark-drive-file",
    fileToken: request.fileToken,
    docType: request.docType,
    fileExtension: request.fileExtension,
    freshnessKey: request.freshnessKey,
    outputName: request.fileName || defaultLarkOutputName(request)
  };
}

function defaultLarkOutputName(request: LarkCachedFileRequest): string {
  if (request.fileName) return request.fileName;
  if (request.action === "drive-export") return `${request.fileToken}.${request.fileExtension || "bin"}`;
  return request.fileToken;
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
  await shell.openExternal(verificationUrl);
  return runLarkCapture(bot, ["auth", "login", "--device-code", deviceCode, "--json"]);
}
