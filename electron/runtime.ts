import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { runClaude } from "./claude.js";
import { addMessageReaction, downloadMessageResources, LarkEventStream, removeMessageReaction, replyToMessage, sendCardToUser } from "./lark-cli.js";
import { Logger } from "./logger.js";
import { preprocessOfficeResources } from "./office.js";
import { discoverSkills } from "./skills.js";
import { stateRoot } from "./paths.js";
import { conversationKey } from "./conversation.js";
import { SessionStore } from "./sessions.js";
import { syncSkillMarket } from "./skill-market.js";
import { addEscalation, completeEscalation, escalationCard, getEscalation, ownerDecision, parseEscalation } from "./escalations.js";
import { TaskLimiter } from "./task-limiter.js";
import { addDeferredTask, continueTaskId, getDeferredTask, parseDeferredTask, updateDeferredTask, type DeferredTask } from "./deferred-tasks.js";
import { cacheMessageResources } from "./file-cache.js";
import type { AppConfig, BotConfig, LarkMessage, RuntimeSnapshot, SkillSummary } from "./types.js";

export class QuarkfanToolsRuntime extends EventEmitter {
  readonly logger = new Logger();
  private streams = new Map<string, LarkEventStream>();
  private connectedBotIds = new Set<string>();
  private processed = new Map<string, Set<string>>();
  private sessionStore = new SessionStore();
  private conversationTasks = new Map<string, Promise<void>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private runningBotIds = new Set<string>();
  private taskLimiter = new TaskLimiter();
  private config!: AppConfig;
  private skills: SkillSummary[] = [];

  constructor() {
    super();
    this.logger.on("entry", (entry) => this.emit("log", entry));
  }

  async initialize(syncMarket = true): Promise<void> {
    this.config = await loadConfig();
    if (syncMarket) {
      try {
        await syncSkillMarket(this.config.skillMarket);
      } catch (error) {
        await this.logger.write("warn", "技能市场自动同步失败", String(error));
      }
    }
    this.skills = await discoverSkills();
    await Promise.all(this.config.bots.flatMap((bot) => [this.loadProcessed(bot.id), this.sessionStore.load(bot)]));
    this.emitSnapshot();
  }

  async start(): Promise<void> {
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    const bots = this.config.bots.filter((bot) => bot.enabled && bot.appId && bot.appSecret);
    await this.logger.write("info", "正在启动 QuarkfanTools", `${bots.length} 个机器人，${this.skills.length} 个 Skill`);
    await Promise.all(bots.map((bot) => this.startBot(bot.id)));
  }

  async startBot(botId: string): Promise<void> {
    if (this.streams.has(botId) || this.runningBotIds.has(botId)) return;
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    const bot = this.config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    if (!bot.enabled) throw new Error("机器人已停用，请先在配置中启用");
    if (!bot.appId || !bot.appSecret) throw new Error("机器人 App ID 或 App Secret 未配置");
    if (!this.config.model.baseUrl || !this.config.model.model || !this.config.model.apiKey) {
      throw new Error("Claude 兼容模型连接未完整配置");
    }
    this.runningBotIds.add(bot.id);
    const stream = this.createStream(bot);
    this.streams.set(bot.id, stream);
    try {
      await this.loadProcessed(bot.id);
      await stream.start(bot);
      await this.logger.write("info", "机器人事件订阅正在连接", bot.receiveIdentity, bot.id);
    } catch (error) {
      this.runningBotIds.delete(bot.id);
      if (this.streams.get(bot.id) === stream) this.streams.delete(bot.id);
      await this.logger.write("error", "机器人启动失败", String(error), bot.id);
    }
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    this.runningBotIds.clear();
    await Promise.all([...this.streams.values()].map((stream) => stream.stop()));
    this.streams.clear();
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    this.connectedBotIds.clear();
    await this.logger.write("info", "QuarkfanTools 已停止");
    this.emitSnapshot();
  }

  async stopBot(botId: string): Promise<void> {
    this.runningBotIds.delete(botId);
    const timer = this.reconnectTimers.get(botId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(botId);
    const stream = this.streams.get(botId);
    if (stream) await stream.stop();
    this.streams.delete(botId);
    this.connectedBotIds.delete(botId);
    const bot = this.config.bots.find((item) => item.id === botId);
    await this.logger.write("info", "机器人监听已停止", bot?.name, botId);
    this.emitSnapshot();
  }

  snapshot(): RuntimeSnapshot {
    return {
      running: this.runningBotIds.size > 0,
      runningBotIds: [...this.runningBotIds],
      connectedBotIds: [...this.connectedBotIds],
      activeTasks: this.taskLimiter.active,
      queuedTasks: this.taskLimiter.queued,
      skills: this.skills,
      config: this.config
    };
  }

  private createStream(bot: BotConfig): LarkEventStream {
    const stream = new LarkEventStream();
    stream.on("message", (message: LarkMessage) => void this.enqueueMessage(bot, message));
    stream.on("connected", () => {
      this.connectedBotIds.add(bot.id);
      void this.logger.write("success", "机器人事件订阅已连接", bot.name, bot.id);
      this.emitSnapshot();
    });
    stream.on("stderr", (text: string) => void this.logger.write("warn", "飞书连接输出", text, bot.id));
    stream.on("exit", ({ code, signal }) => {
      this.connectedBotIds.delete(bot.id);
      if (this.streams.get(bot.id) === stream) this.streams.delete(bot.id);
      this.emitSnapshot();
      if (this.runningBotIds.has(bot.id)) {
        void this.logger.write("error", "机器人事件订阅已退出，5 秒后重连", `code=${code} signal=${signal}`, bot.id);
        this.scheduleReconnect(bot);
      }
    });
    return stream;
  }

  private scheduleReconnect(bot: BotConfig): void {
    const existing = this.reconnectTimers.get(bot.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => void this.reconnect(bot), 5000);
    this.reconnectTimers.set(bot.id, timer);
  }

  private async reconnect(bot: BotConfig): Promise<void> {
    this.reconnectTimers.delete(bot.id);
    if (!this.runningBotIds.has(bot.id)) return;
    if (this.streams.has(bot.id)) return;
    const stream = this.createStream(bot);
    this.streams.set(bot.id, stream);
    try {
      await stream.start(bot);
      await this.logger.write("info", "机器人事件订阅正在重连", bot.name, bot.id);
    } catch (error) {
      if (this.streams.get(bot.id) === stream) this.streams.delete(bot.id);
      await this.logger.write("error", "机器人重连失败，5 秒后重试", String(error), bot.id);
      this.scheduleReconnect(bot);
    }
  }

  private emitSnapshot(): void {
    if (this.config) this.emit("snapshot", this.snapshot());
  }

  private enqueueMessage(bot: BotConfig, message: LarkMessage): void {
    const key = `${bot.id}:${conversationKey(message)}`;
    const previous = this.conversationTasks.get(key) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(() => this.runWithTaskSlot(bot, message))
      .finally(() => {
        if (this.conversationTasks.get(key) === task) this.conversationTasks.delete(key);
      });
    this.conversationTasks.set(key, task);
  }

  private async runWithTaskSlot(bot: BotConfig, message: LarkMessage): Promise<void> {
    if (this.processed.get(bot.id)?.has(message.eventId)) return;
    const limit = Math.max(1, Math.floor(this.config.runtime.maxConcurrentTasks || 1));
    const wasQueued = this.taskLimiter.active >= limit;
    const pendingRelease = this.taskLimiter.acquire(limit);
    const queuedReaction = wasQueued ? this.addPendingReaction(bot, message, Date.now()) : undefined;
    if (wasQueued) {
      this.emitSnapshot();
      await this.logger.write("info", "消息已进入处理队列", `${message.text} / 当前运行 ${this.taskLimiter.active}，排队 ${this.taskLimiter.queued}`, bot.id);
    }
    const release = await pendingRelease;
    this.emitSnapshot();
    try {
      await this.handleMessage(bot, message, queuedReaction);
    } finally {
      release();
      this.emitSnapshot();
    }
  }

  private async handleMessage(bot: BotConfig, message: LarkMessage, existingReaction?: Promise<string>): Promise<void> {
    const originalUserText = message.text;
    const processed = this.processed.get(bot.id) ?? new Set<string>();
    if (processed.has(message.eventId)) return;
    processed.add(message.eventId);
    this.processed.set(bot.id, processed);

    const delay = eventDelayMs(message);
    await this.logger.write(
      "info",
      "收到飞书消息",
      `${delay === null ? "" : `投递延迟 ${formatDelay(delay)} / `}${message.text}`,
      bot.id
    );
    void this.saveProcessed(bot.id);
    const startedAt = Date.now();
    const timings: string[] = [];
    const pendingReaction = existingReaction ?? this.addPendingReaction(bot, message, startedAt);

    try {
      const decision = ownerDecision(message);
      if (decision && bot.ownerOpenId && message.senderId === bot.ownerOpenId) {
        const escalation = await getEscalation(bot, decision.id);
        if (!escalation) {
          await replyToMessage(bot, message.messageId, `未找到待处理请求 ${decision.id}，可能已处理或编号有误。`);
          return;
        }
        await replyToMessage(bot, escalation.messageId, decision.response);
        await replyToMessage(bot, message.messageId, `已将处理结果发送给原提问人（请求 ${decision.id}）。`);
        await completeEscalation(bot, decision.id);
        await this.logger.write("success", "Owner 已处理人工请求", `${decision.id} / ${decision.response}`, bot.id);
        return;
      }
      const allowed = new Set(bot.skillNames);
      const botSkills = this.skills.filter((skill) => allowed.has(skill.name));
      let key = conversationKey(message);
      let resumedTask: DeferredTask | null = null;
      const requestedTaskId = continueTaskId(message.text);
      if (requestedTaskId) {
        resumedTask = await getDeferredTask(bot, requestedTaskId);
        if (!resumedTask || resumedTask.status === "completed") {
          await replyToMessage(bot, message.messageId, `未找到可继续的任务 ${requestedTaskId}，可能已完成或编号有误。`);
          return;
        }
        key = resumedTask.conversationKey;
        resumedTask.status = "scheduled";
        await updateDeferredTask(bot, resumedTask);
        message = { ...message, text: resumedTask.followUpPrompt };
        await replyToMessage(bot, message.messageId, `已调度任务 ${resumedTask.id}，我会等待文件下载和分析完成后回复。`);
      }
      if (["/new", "新对话", "重置会话"].includes(message.text.trim())) {
        await this.sessionStore.clear(bot, key);
        await replyToMessage(bot, message.messageId, "已开启新对话，后续消息不会沿用之前的上下文。");
        await this.logger.write("success", "已重置连续会话", key, bot.id);
        return;
      }
      const resourcesDir = path.join(stateRoot(), "bots", bot.id, "messages", message.messageId);
      let enrichedMessage = message;
      const resourceStartedAt = Date.now();
      try {
        enrichedMessage = await downloadMessageResources(bot, message, resourcesDir);
        enrichedMessage = await preprocessOfficeResources(enrichedMessage, resourcesDir, this.config.model.multimodalEnabled);
        await cacheMessageResources(bot, enrichedMessage);
        if (enrichedMessage.resources.length > 0) {
          await this.logger.write("info", "已下载飞书消息资源", `${enrichedMessage.resources.length} 个`, bot.id);
        }
      } catch (error) {
        await this.logger.write("warn", "下载飞书消息资源失败，继续处理文本内容", String(error), bot.id);
      }
      timings.push(`资源 ${formatDelay(Date.now() - resourceStartedAt)}`);
      const agentStartedAt = Date.now();
      let lastProgressKey = "";
      let lastLoggedProgressKey = "";
      let lastProgressAt = 0;
      const result = await runClaude(this.config, bot, enrichedMessage, botSkills, key, this.sessionStore.get(bot, key), (progress) => {
        if (progress.key !== lastLoggedProgressKey) {
          lastLoggedProgressKey = progress.key;
          void this.logger.write("info", "Agent 工作过程", progress.text, bot.id);
        }
        if (!bot.showProgress || progress.key === lastProgressKey || Date.now() - lastProgressAt < 8000) return;
        lastProgressKey = progress.key;
        lastProgressAt = Date.now();
        void replyToMessage(bot, message.messageId, `工作进度：${progress.text}`).catch((error) => (
          this.logger.write("warn", "发送工作进度失败", String(error), bot.id)
        ));
      });
      timings.push(`Agent ${formatDelay(Date.now() - agentStartedAt)}`);
      const replyStartedAt = Date.now();
      const escalation = parseEscalation(result.response);
      const deferred = parseDeferredTask(result.response);
      let finalReply = result.response;
      if (deferred) {
        const task = await addDeferredTask(bot, deferred, message, key);
        finalReply = `${deferred.summary}\n\n如需继续等待下载并完成深度分析，请回复：/continue ${task.id}`;
        await replyToMessage(bot, message.messageId, finalReply);
        await this.logger.write("info", "已创建待确认下载任务", `${task.id} / ${deferred.summary}`, bot.id);
      } else if (escalation && bot.ownerOpenId) {
        const pending = await addEscalation(bot, escalation, message);
        try {
          await sendCardToUser(bot, bot.ownerOpenId, escalationCard(bot, pending), `owner-${bot.id}-${pending.id}`);
          finalReply = `这个问题需要人工${pending.type === "approval" ? "授权" : "协助"}，我已私聊 Owner 跟进（请求 ${pending.id}）。`;
          await replyToMessage(bot, message.messageId, finalReply);
          await this.logger.write("info", "已向 Owner 发送人工请求", `${pending.id} / ${pending.summary}`, bot.id);
        } catch (error) {
          finalReply = "这个问题需要人工协助，但目前无法联系配置的 Owner。请管理员确认 Owner open_id 正确，并且该用户有应用使用权限。";
          await replyToMessage(bot, message.messageId, finalReply);
          await completeEscalation(bot, pending.id);
          await this.logger.write("error", "向 Owner 发送人工请求失败", String(error), bot.id);
        }
      } else {
        await replyToMessage(bot, message.messageId, result.response);
      }
      if (result.sessionId) await this.sessionStore.set(bot, key, result.sessionId, message.messageId, {
        user: originalUserText,
        assistant: finalReply
      });
      if (resumedTask) {
        resumedTask.status = "completed";
        await updateDeferredTask(bot, resumedTask);
      }
      timings.push(`飞书回复 ${formatDelay(Date.now() - replyStartedAt)}`);
      await this.logger.write("success", "消息处理并回复完成", result.response, bot.id);
      await this.logger.write("info", "消息处理耗时", `${timings.join(" / ")} / 总计 ${formatDelay(Date.now() - startedAt)}`, bot.id);
    } catch (error) {
      await this.logger.write("error", "消息处理失败", String(error), bot.id);
      if (/maximum number of turns|Reached maximum number of turns/i.test(String(error))) {
        await replyToMessage(bot, message.messageId, "这次检索和文件处理步骤超过了当前 Agent 最大步数限制，任务已停止。管理员可以在配置中调高“单次 Agent 最大步数”，或让问题更聚焦后重试。").catch(() => undefined);
      }
    } finally {
      const pendingReactionId = await pendingReaction;
      if (pendingReactionId) {
        try {
          await removeMessageReaction(bot, message.messageId, pendingReactionId);
          await this.logger.write("info", "已移除处理中表情", bot.name, bot.id);
        } catch (error) {
          await this.logger.write("warn", "移除处理中表情失败", String(error), bot.id);
        }
      }
    }
  }

  private addPendingReaction(bot: BotConfig, message: LarkMessage, startedAt: number): Promise<string> {
    return addMessageReaction(bot, message.messageId, bot.pendingReaction || "OnIt")
      .then(async (reactionId) => {
        await this.logger.write("info", "已添加处理中表情", `${bot.name} / ${formatDelay(Date.now() - startedAt)}`, bot.id);
        return reactionId;
      })
      .catch(async (error) => {
        await this.logger.write("warn", "添加处理中表情失败，继续处理消息", String(error), bot.id);
        return "";
      });
  }

  private async loadProcessed(botId: string): Promise<void> {
    try {
      const values = JSON.parse(await readFile(processedPath(botId), "utf8")) as string[];
      this.processed.set(botId, new Set(values));
    } catch {
      this.processed.set(botId, new Set());
    }
  }

  private async saveProcessed(botId: string): Promise<void> {
    const values = [...(this.processed.get(botId) ?? [])].slice(-5000);
    await mkdir(path.dirname(processedPath(botId)), { recursive: true });
    await writeFile(processedPath(botId), `${JSON.stringify(values, null, 2)}\n`, "utf8");
  }
}

function processedPath(botId: string): string {
  return path.join(stateRoot(), "bots", botId, "processed.json");
}

function eventDelayMs(message: LarkMessage): number | null {
  if (!message.createdAt) return null;
  const raw = Number(message.createdAt);
  const created = Number.isFinite(raw)
    ? raw < 10_000_000_000 ? raw * 1000 : raw
    : Date.parse(message.createdAt);
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Date.parse(message.receivedAt) - created);
}

function formatDelay(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
