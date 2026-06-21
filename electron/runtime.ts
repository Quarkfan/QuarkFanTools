import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { runClaude } from "./claude.js";
import { addMessageReaction, downloadMessageResources, getLarkBotIdentity, LarkEventStream, removeMessageReaction, replyToMessage, sendCardToUser } from "./lark-cli.js";
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
import { selectLarkMessageTarget } from "./lark-message-router.js";
import { hasProcessedMessage, markProcessedMessage } from "./message-dedupe.js";
import { maskAppId, runningBotWithSameAppId } from "./bot-identity.js";
import { BotScheduler, loadScheduledTasks, nextRunAt, saveScheduledTasks } from "./scheduled-tasks.js";
import type { AppConfig, BotConfig, LarkBotIdentity, LarkMessage, RuntimeSnapshot, ScheduledTask, SkillSummary } from "./types.js";

const STREAM_RENEW_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STREAM_RENEW_JITTER_MS = 10 * 60 * 1000;

export class QuarkfanToolsRuntime extends EventEmitter {
  readonly logger = new Logger();
  private streams = new Map<string, LarkEventStream>();
  private connectedBotIds = new Set<string>();
  private processed = new Map<string, Set<string>>();
  private sessionStore = new SessionStore();
  private conversationTasks = new Map<string, Promise<void>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private streamRenewTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private renewingBotIds = new Set<string>();
  private runningBotIds = new Set<string>();
  private botIdentities = new Map<string, LarkBotIdentity>();
  private schedulers = new Map<string, BotScheduler>();
  private scheduledTaskCounts = new Map<string, number>();
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
    await this.loadScheduledTaskCounts();
    this.emitSnapshot();
  }

  async start(): Promise<void> {
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    const bots = this.config.bots.filter((bot) => bot.enabled && bot.appId && bot.appSecret);
    await this.logger.write("info", "正在启动 QuarkfanTools", `${bots.length} 个机器人，${this.skills.length} 个 Skill`);
    for (const bot of bots) {
      await this.startBot(bot.id);
    }
  }

  async startBot(botId: string): Promise<void> {
    if (this.streams.has(botId) || this.runningBotIds.has(botId)) {
      await this.logger.write("info", "机器人已在运行或正在连接", botId, botId);
      return;
    }
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    const bot = this.config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    await this.logger.write("info", "收到机器人启动请求", bot.name, bot.id);
    if (!bot.enabled) throw new Error("机器人已停用，请先在配置中启用");
    if (!bot.appId || !bot.appSecret) throw new Error("机器人 App ID 或 App Secret 未配置");
    const conflictingBot = runningBotWithSameAppId(bot, this.config.bots, this.runningBotIds);
    if (conflictingBot) {
      const message = `飞书 App ID ${maskAppId(bot.appId)} 已被“${conflictingBot.name}”监听。一个飞书应用同一时间只能对应一个本地 Bot；同一机器人下的不同角色请用 Skill、命令或套件路由。`;
      await this.logger.write("error", "机器人启动失败", message, bot.id);
      throw new Error(message);
    }
    if (!this.config.model.baseUrl || !this.config.model.model || !this.config.model.apiKey) {
      throw new Error("Claude 兼容模型连接未完整配置");
    }
    await this.logger.write("info", "正在确认飞书 Bot 身份", maskAppId(bot.appId), bot.id);
    const identity = await getLarkBotIdentity(bot);
    this.botIdentities.set(bot.id, identity);
    await this.logger.write("info", "飞书 Bot 身份已确认", `${maskAppId(bot.appId)} / ${identity.appName ?? "未命名"} / ${identity.openId}`, bot.id);
    this.runningBotIds.add(bot.id);
    try {
      await this.loadProcessed(bot.id);
      await this.startBotStream(bot);
      await this.startBotScheduler(bot);
    } catch (error) {
      this.runningBotIds.delete(bot.id);
      this.botIdentities.delete(bot.id);
      this.stopBotScheduler(bot.id);
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
    for (const timer of this.streamRenewTimers.values()) clearTimeout(timer);
    this.streamRenewTimers.clear();
    for (const scheduler of this.schedulers.values()) scheduler.stop();
    this.schedulers.clear();
    this.renewingBotIds.clear();
    this.connectedBotIds.clear();
    this.botIdentities.clear();
    await this.logger.write("info", "QuarkfanTools 已停止");
    this.emitSnapshot();
  }

  async stopBot(botId: string): Promise<void> {
    this.runningBotIds.delete(botId);
    const timer = this.reconnectTimers.get(botId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(botId);
    this.clearStreamRenewal(botId);
    const stream = this.streams.get(botId);
    if (stream) await stream.stop();
    this.streams.delete(botId);
    this.connectedBotIds.delete(botId);
    this.renewingBotIds.delete(botId);
    this.botIdentities.delete(botId);
    this.stopBotScheduler(botId);
    const bot = this.config.bots.find((item) => item.id === botId);
    await this.logger.write("info", "机器人监听已停止", bot?.name, botId);
    this.emitSnapshot();
  }

  snapshot(): RuntimeSnapshot {
    return {
      running: this.runningBotIds.size > 0,
      runningBotIds: [...this.runningBotIds],
      connectedBotIds: [...this.connectedBotIds],
      scheduledTaskCount: [...this.scheduledTaskCounts.values()].reduce((sum, count) => sum + count, 0),
      activeTasks: this.taskLimiter.active,
      queuedTasks: this.taskLimiter.queued,
      skills: this.skills,
      config: this.config
    };
  }

  async reloadScheduledTasks(botId: string): Promise<void> {
    const bot = this.config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    const tasks = await loadScheduledTasks(bot);
    this.scheduledTaskCounts.set(bot.id, tasks.length);
    const scheduler = this.schedulers.get(bot.id);
    if (scheduler) scheduler.reload(tasks);
    await this.logger.write("info", "已重新加载定时任务", `${tasks.length} 个`, bot.id);
    this.emitSnapshot();
  }

  async runScheduledTaskNow(botId: string, taskId: string): Promise<void> {
    const bot = this.config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    await this.executeScheduledTask(bot, taskId, true);
  }

  private createBotStream(bot: BotConfig): LarkEventStream {
    const stream = new LarkEventStream();
    stream.on("message", (message: LarkMessage) => {
      this.routeBotMessage(bot, message);
    });
    stream.on("connected", () => {
      this.connectedBotIds.add(bot.id);
      void this.logger.write("success", "飞书事件监听已连接", bot.name, bot.id);
      this.scheduleStreamRenewal(bot, stream);
      this.emitSnapshot();
    });
    stream.on("stderr", (text: string) => void this.logger.write("warn", "飞书连接输出", text, bot.id));
    stream.on("exit", ({ code, signal }) => {
      this.connectedBotIds.delete(bot.id);
      this.clearStreamRenewal(bot.id);
      if (this.streams.get(bot.id) === stream) this.streams.delete(bot.id);
      this.emitSnapshot();
      if (this.runningBotIds.has(bot.id) && !this.renewingBotIds.has(bot.id)) {
        void this.logger.write("error", "飞书事件监听已退出，5 秒后重连", `code=${code} signal=${signal}`, bot.id);
        this.scheduleReconnect(bot);
      }
    });
    return stream;
  }

  private runningBots(): BotConfig[] {
    return this.config.bots.filter((item) => this.runningBotIds.has(item.id));
  }

  private async startBotStream(bot: BotConfig): Promise<void> {
    const existing = this.streams.get(bot.id);
    if (existing) await existing.stop();
    this.connectedBotIds.delete(bot.id);
    const stream = this.createBotStream(bot);
    this.streams.set(bot.id, stream);
    try {
      await stream.start(bot);
      await this.logger.write("info", "飞书事件监听正在连接", bot.receiveIdentity, bot.id);
    } catch (error) {
      if (this.streams.get(bot.id) === stream) this.streams.delete(bot.id);
      this.connectedBotIds.delete(bot.id);
      throw error;
    }
  }

  private async loadScheduledTaskCounts(): Promise<void> {
    await Promise.all(this.config.bots.map(async (bot) => {
      this.scheduledTaskCounts.set(bot.id, (await loadScheduledTasks(bot)).length);
    }));
  }

  private async startBotScheduler(bot: BotConfig): Promise<void> {
    const tasks = await loadScheduledTasks(bot);
    this.scheduledTaskCounts.set(bot.id, tasks.length);
    const scheduler = new BotScheduler((taskId) => this.executeScheduledTask(bot, taskId, false));
    scheduler.start(tasks);
    this.schedulers.set(bot.id, scheduler);
    await this.logger.write("info", "Bot 定时任务调度器已启动", `${tasks.filter((task) => task.enabled).length}/${tasks.length} 已启用`, bot.id);
    this.emitSnapshot();
  }

  private stopBotScheduler(botId: string): void {
    const scheduler = this.schedulers.get(botId);
    if (scheduler) scheduler.stop();
    this.schedulers.delete(botId);
  }

  private routeBotMessage(sourceBot: BotConfig, message: LarkMessage): void {
    const bots = this.runningBots();
    const route = selectLarkMessageTarget(bots, message, this.botIdentities, bots.length > 1);
    if (!route.bot) {
      void this.logger.write("info", "已忽略无法确定目标机器人的飞书消息", JSON.stringify({
        reason: route.reason,
        sourceBotId: sourceBot.id,
        text: message.text,
        eventId: message.eventId,
        messageId: message.messageId,
        chatType: message.chatType,
        sourceAppId: message.sourceAppId,
        mentions: message.mentions ?? [],
        candidates: route.ignored.map((item) => ({
          botId: item.bot.id,
          botName: item.bot.name,
          reason: item.decision.reason,
          botOpenId: item.decision.botOpenId,
          mentionValues: item.decision.mentionValues,
          botMatchers: item.decision.botMatchers
        }))
      }), sourceBot.id);
      return;
    }
    for (const ignored of route.ignored.filter((item) => item.bot.id !== route.bot?.id)) {
      if (ignored.decision.targeted) continue;
      void this.logger.write("info", "已忽略非当前机器人艾特消息", JSON.stringify({
        reason: ignored.decision.reason,
        routedBotId: route.bot.id,
        routedBotName: route.bot.name,
        sourceBotId: sourceBot.id,
        text: message.text,
        eventId: message.eventId,
        messageId: message.messageId,
        chatType: message.chatType,
        botOpenId: ignored.decision.botOpenId,
        sourceAppId: ignored.decision.sourceAppId,
        mentions: message.mentions ?? [],
        mentionValues: ignored.decision.mentionValues,
        botMatchers: ignored.decision.botMatchers
      }), ignored.bot.id);
    }
    if (sourceBot.id !== route.bot.id) {
      void this.logger.write("info", "飞书事件已跨 Bot 路由", `${sourceBot.name} -> ${route.bot.name} / ${route.reason}`, route.bot.id);
    }
    void this.enqueueMessage(route.bot, message);
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
    const currentBot = this.config.bots.find((item) => item.id === bot.id) ?? bot;
    try {
      if (!this.botIdentities.has(currentBot.id)) {
        const identity = await getLarkBotIdentity(currentBot);
        this.botIdentities.set(currentBot.id, identity);
        await this.logger.write("info", "飞书 Bot 身份已确认", `${maskAppId(currentBot.appId)} / ${identity.appName ?? "未命名"} / ${identity.openId}`, currentBot.id);
      }
      await this.startBotStream(currentBot);
      await this.logger.write("info", "飞书事件监听正在重连", currentBot.name, currentBot.id);
    } catch (error) {
      this.streams.delete(currentBot.id);
      this.connectedBotIds.delete(currentBot.id);
      await this.logger.write("error", "飞书事件监听重连失败，5 秒后重试", String(error), currentBot.id);
      this.scheduleReconnect(currentBot);
    }
  }

  private clearStreamRenewal(botId: string): void {
    const timer = this.streamRenewTimers.get(botId);
    if (timer) clearTimeout(timer);
    this.streamRenewTimers.delete(botId);
  }

  private scheduleStreamRenewal(bot: BotConfig, stream: LarkEventStream): void {
    this.clearStreamRenewal(bot.id);
    const jitter = Math.floor(Math.random() * STREAM_RENEW_JITTER_MS);
    const timer = setTimeout(() => void this.renewBotStream(bot, stream), STREAM_RENEW_INTERVAL_MS + jitter);
    this.streamRenewTimers.set(bot.id, timer);
  }

  private async renewBotStream(bot: BotConfig, stream: LarkEventStream): Promise<void> {
    this.streamRenewTimers.delete(bot.id);
    if (this.renewingBotIds.has(bot.id)) return;
    if (!this.runningBotIds.has(bot.id) || this.streams.get(bot.id) !== stream) return;
    this.renewingBotIds.add(bot.id);
    try {
      await this.logger.write("info", "飞书事件监听定期续连", "长期运行维护，主动重建订阅连接", bot.id);
      await stream.stop();
      if (!this.runningBotIds.has(bot.id)) return;
      const currentBot = this.config.bots.find((item) => item.id === bot.id) ?? bot;
      await this.startBotStream(currentBot);
    } catch (error) {
      this.streams.delete(bot.id);
      this.connectedBotIds.delete(bot.id);
      await this.logger.write("error", "飞书事件监听定期续连失败，5 秒后重试", String(error), bot.id);
      this.scheduleReconnect(bot);
    } finally {
      this.renewingBotIds.delete(bot.id);
      this.emitSnapshot();
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
    if (this.hasProcessedMessage(bot.id, message)) return;
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
    if (this.hasProcessedMessage(bot.id, message)) return;
    this.markProcessedMessage(bot.id, message);

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

  private async executeScheduledTask(bot: BotConfig, taskId: string, manual: boolean): Promise<void> {
    const tasks = await loadScheduledTasks(bot);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("定时任务不存在");
    if (!task.enabled && !manual) return;
    if (!task.target.prompt.trim()) {
      await this.updateScheduledTaskState(bot, task, tasks, "skipped", "任务提示词为空");
      await this.logger.write("warn", "已跳过定时任务", `${task.name} / 任务提示词为空`, bot.id);
      return;
    }
    const release = await this.taskLimiter.acquire(this.config.runtime.maxConcurrentTasks);
    const startedAt = Date.now();
    await this.logger.write("info", manual ? "正在手动运行定时任务" : "正在运行定时任务", task.name, bot.id);
    try {
      const result = await withTimeout(this.runScheduledAgent(bot, task), task.policy.timeoutSeconds * 1000);
      await this.updateScheduledTaskState(bot, task, tasks, "success");
      await this.logger.write("success", "定时任务执行完成", `${task.name} / ${formatDelay(Date.now() - startedAt)} / ${result.response}`, bot.id);
    } catch (error) {
      await this.updateScheduledTaskState(bot, task, tasks, "failed", String(error));
      await this.logger.write("error", "定时任务执行失败", `${task.name} / ${String(error)}`, bot.id);
    } finally {
      release();
      this.emitSnapshot();
    }
  }

  private async runScheduledAgent(bot: BotConfig, task: ScheduledTask): Promise<{ response: string; sessionId: string }> {
    const allowed = new Set(bot.skillNames);
    const botSkills = this.skills.filter((skill) => allowed.has(skill.name));
    const key = `scheduled:${task.id}`;
    const message: LarkMessage = {
      eventId: `scheduled:${task.id}:${Date.now()}`,
      messageId: `scheduled-${task.id}`,
      chatId: `scheduled:${task.id}`,
      chatType: "scheduled",
      senderId: "scheduled-task",
      messageType: "text",
      text: task.target.prompt,
      resources: [],
      receivedAt: new Date().toISOString(),
      raw: { scheduledTaskId: task.id }
    };
    const result = await runClaude(this.config, bot, message, botSkills, key, this.sessionStore.get(bot, key), (progress) => {
      void this.logger.write("info", "定时任务 Agent 工作过程", `${task.name} / ${progress.text}`, bot.id);
    });
    if (result.sessionId) await this.sessionStore.set(bot, key, result.sessionId, message.messageId, {
      user: task.target.prompt,
      assistant: result.response
    });
    return result;
  }

  private async updateScheduledTaskState(
    bot: BotConfig,
    task: ScheduledTask,
    tasks: ScheduledTask[],
    status: "success" | "failed" | "skipped",
    error?: string
  ): Promise<void> {
    const current = tasks.find((item) => item.id === task.id) ?? task;
    current.state.lastRunAt = new Date().toISOString();
    current.state.lastStatus = status;
    current.state.lastError = error ? error.slice(0, 1000) : undefined;
    if (current.trigger.type === "once") {
      current.enabled = false;
      current.state.nextRunAt = undefined;
    } else {
      current.state.nextRunAt = nextRunAt(current, new Date()).toISOString();
    }
    const saved = await saveScheduledTasks(bot, tasks);
    this.scheduledTaskCounts.set(bot.id, saved.length);
    const scheduler = this.schedulers.get(bot.id);
    if (scheduler) scheduler.reload(saved);
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

  private hasProcessedMessage(botId: string, message: LarkMessage): boolean {
    return hasProcessedMessage(this.processed.get(botId), message);
  }

  private markProcessedMessage(botId: string, message: LarkMessage): void {
    const processed = this.processed.get(botId) ?? new Set<string>();
    markProcessedMessage(processed, message);
    this.processed.set(botId, processed);
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`定时任务超过 ${Math.round(timeoutMs / 1000)} 秒超时限制`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
