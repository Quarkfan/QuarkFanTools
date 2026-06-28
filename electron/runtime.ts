import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { runClaude, type ClaudeSuiteContext } from "./claude.js";
import { getLarkBotIdentity, materializeLarkCachedFile } from "./lark-cli.js";
import { imProvider, imProviderForBot, type ImEventStream } from "./im-providers.js";
import { Logger } from "./logger.js";
import { preprocessOfficeResources } from "./office.js";
import { discoverSkills } from "./skills.js";
import { discoverCustomApps } from "./apps.js";
import { discoverSuites } from "./suites.js";
import { capabilityDefinitions, capabilityGovernanceDiagnostics } from "./capabilities.js";
import { stateRoot } from "./paths.js";
import { conversationKey } from "./conversation.js";
import { SessionStore } from "./sessions.js";
import { syncSkillMarket } from "./skill-market.js";
import { addEscalation, completeEscalation, escalationCard, getEscalation, ownerDecision, parseEscalation } from "./escalations.js";
import { TaskLimiter } from "./task-limiter.js";
import { addDeferredTask, continueTaskId, getDeferredTask, parseDeferredTask, updateDeferredTask, type DeferredTask } from "./deferred-tasks.js";
import { parseLarkCachedFileRequest } from "./lark-cached-file-protocol.js";
import { cacheMessageResources } from "./file-cache.js";
import { commandHelpText, commandPrompt, findCommandBinding, parseSlashCommand } from "./commands.js";
import { botCapabilityRefs, resolveBotCapabilities } from "./capabilities.js";
import { capabilityOwnerApprovalReason } from "./capability-approval.js";
import { appendCapabilityAudit, auditCapability } from "./capability-audit.js";
import { executeCapabilityTarget, type WorkflowStepExecutionEvent } from "./capability-executor.js";
import { resolveExecutableCapabilityBinding } from "./executable-capability-bindings.js";
import { appendScheduledTaskRun, dueScheduledTasks, hydrateBotScheduledTasks, nextTaskRun, persistBotScheduledTasks, refreshBotScheduledTasks } from "./scheduled-tasks.js";
import { larkConnectorBot, primaryProvider } from "./platform-connectors.js";
import { maskAppId, runningBotWithSameAppId } from "./bot-identity.js";
import { selectLarkMessageTarget } from "./lark-message-router.js";
import type { AppConfig, BotConfig, ChatMessage, CustomAppSummary, LarkBotIdentity, RuntimeSnapshot, ScheduledTask, SessionTranscriptEvent, SkillSummary, SuiteSummary } from "./types.js";

export class QuarkfanToolsRuntime extends EventEmitter {
  readonly logger = new Logger();
  private streams = new Map<string, ImEventStream>();
  private connectedBotIds = new Set<string>();
  private processed = new Map<string, Set<string>>();
  private sessionStore = new SessionStore();
  private conversationTasks = new Map<string, Promise<void>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private scheduledTaskTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private activeScheduledRuns = new Set<string>();
  private runningBotIds = new Set<string>();
  private botIdentities = new Map<string, LarkBotIdentity>();
  private taskLimiter = new TaskLimiter();
  private config!: AppConfig;
  private skills: SkillSummary[] = [];
  private customApps: CustomAppSummary[] = [];
  private suites: SuiteSummary[] = [];

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
    this.customApps = await discoverCustomApps();
    this.suites = await discoverSuites();
    await Promise.all(this.config.bots.flatMap((bot) => [this.loadProcessed(bot.id), this.sessionStore.load(bot)]));
    await this.refreshAllScheduledTasks();
    this.emitSnapshot();
  }

  async start(): Promise<void> {
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    this.customApps = await discoverCustomApps();
    this.suites = await discoverSuites();
    const bots = this.config.bots.filter((bot) => bot.enabled && bot.appId && bot.appSecret && primaryProvider(bot) !== "wecom");
    await this.logger.write("info", "正在启动 QuarkfanTools", `${bots.length} 个机器人，${this.skills.length} 个 Skill`);
    for (const bot of bots) {
      await this.startBot(bot.id);
    }
    await this.refreshAllScheduledTasks();
  }

  async startBot(botId: string): Promise<void> {
    if (this.streams.has(botId) || this.runningBotIds.has(botId)) {
      await this.logger.write("info", "机器人已在运行或正在连接", botId, botId);
      return;
    }
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    this.customApps = await discoverCustomApps();
    this.suites = await discoverSuites();
    const bot = this.config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    await this.logger.write("info", "收到机器人启动请求", bot.name, bot.id);
    if (!bot.enabled) throw new Error("机器人已停用，请先在配置中启用");
    if (primaryProvider(bot) === "wecom") {
      const message = "企业微信 Provider 因官方能力限制暂时封闭。当前版本不会启动企业微信监听、轮询或投递；请先改用飞书 Bot。";
      await this.logger.write("warn", "企业微信 Provider 暂时封闭", message, bot.id);
      throw new Error(message);
    }
    if (!bot.appId || !bot.appSecret) throw new Error("机器人 App ID 或 App Secret 未配置");
    if (!this.config.model.baseUrl || !this.config.model.model || !this.config.model.apiKey) {
      throw new Error("Claude 兼容模型连接未完整配置");
    }
    if (primaryProvider(bot) === "lark") {
      const duplicated = runningBotWithSameAppId(bot, this.config.bots.filter((item) => primaryProvider(item) === "lark"), this.runningBotIds);
      if (duplicated) {
        throw new Error(`飞书 App ID 已被运行中的机器人使用：${duplicated.name}。同一飞书应用同一时间只能启动一个本地 Bot。`);
      }
      await this.logger.write("info", "正在确认飞书 Bot 身份", maskAppId(bot.appId), bot.id);
      const identity = await getLarkBotIdentity(bot);
      this.botIdentities.set(bot.id, identity);
      await this.logger.write("info", "飞书 Bot 身份已确认", `${maskAppId(bot.appId)} / ${identity.appName ?? "未命名"} / ${identity.openId}`, bot.id);
    }
    this.runningBotIds.add(bot.id);
    try {
      await this.loadProcessed(bot.id);
      const stream = this.createStream(bot);
      this.streams.set(bot.id, stream);
      await stream.start(bot);
      await this.logger.write("info", "机器人事件订阅正在连接", bot.receiveIdentity, bot.id);
    } catch (error) {
      this.runningBotIds.delete(bot.id);
      this.botIdentities.delete(bot.id);
      const stream = this.streams.get(bot.id);
      if (stream) {
        await stream.stop().catch(() => undefined);
        this.streams.delete(bot.id);
      }
      await this.logger.write("error", "机器人启动失败", String(error), bot.id);
    }
    await this.refreshBotScheduledTimers(bot);
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    this.runningBotIds.clear();
    await Promise.all([...this.streams.values()].map((stream) => stream.stop()));
    this.streams.clear();
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    for (const timer of this.scheduledTaskTimers.values()) clearTimeout(timer);
    this.scheduledTaskTimers.clear();
    this.activeScheduledRuns.clear();
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
    const bot = this.config.bots.find((item) => item.id === botId);
    const stream = this.streams.get(botId);
    if (stream) await stream.stop();
    this.streams.delete(botId);
    this.connectedBotIds.delete(botId);
    this.botIdentities.delete(botId);
    await this.logger.write("info", "机器人监听已停止", bot?.name, botId);
    for (const [key, timer] of this.scheduledTaskTimers.entries()) {
      if (!key.startsWith(`${botId}:`)) continue;
      clearTimeout(timer);
      this.scheduledTaskTimers.delete(key);
    }
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
      customApps: this.customApps,
      suites: this.suites,
      capabilities: capabilityDefinitions(this.skills, this.customApps, this.suites, this.config.mcpServers),
      capabilityDiagnostics: capabilityGovernanceDiagnostics(this.skills, this.customApps, this.suites, this.config.mcpServers),
      config: this.config
    };
  }

  async triggerScheduledTaskNow(botId: string, taskId: string): Promise<RuntimeSnapshot> {
    const bot = this.config.bots.find((item) => item.id === botId);
    const task = bot?.scheduledTasks?.find((item) => item.id === taskId);
    if (!bot) throw new Error("机器人不存在");
    if (!task) throw new Error("定时任务不存在");
    if (!task.enabled) throw new Error("定时任务已停用，不能手动触发");
    await this.logger.write("info", "已手动触发定时任务", task.name, bot.id);
    void this.runScheduledTask(bot.id, task.id, "manual");
    this.emitSnapshot();
    return this.snapshot();
  }

  private createStream(bot: BotConfig): ImEventStream {
    const provider = imProviderForBot(bot);
    const stream = provider.createStream();
    stream.on("message", (message: ChatMessage) => {
      const normalized = { ...message, provider: provider.id };
      if (provider.id === "lark") {
        this.routeLarkBotMessage(bot, normalized);
        return;
      }
      void this.enqueueMessage(bot, normalized);
    });
    stream.on("connected", () => {
      this.connectedBotIds.add(bot.id);
      void this.logger.write("success", "机器人事件订阅已连接", `${provider.label} / ${bot.name}`, bot.id);
      this.emitSnapshot();
    });
    stream.on("stderr", (text: string) => void this.logger.write("warn", `${provider.label}连接输出`, text, bot.id));
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

  private runningLarkBots(): BotConfig[] {
    return this.config.bots.filter((item) => primaryProvider(item) === "lark" && this.runningBotIds.has(item.id));
  }

  private routeLarkBotMessage(sourceBot: BotConfig, message: ChatMessage): void {
    const bots = this.runningLarkBots();
    const route = selectLarkMessageTarget(bots, message, this.botIdentities, bots.length > 1);
    if (!route.bot) {
      void this.logger.write("info", "已忽略无法确定目标机器人的飞书消息", JSON.stringify({
        reason: route.reason,
        sourceBotId: sourceBot.id,
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
    const isLark = primaryProvider(bot) === "lark";
    if (this.streams.has(bot.id)) return;
    const currentBot = this.config.bots.find((item) => item.id === bot.id) ?? bot;
    const stream = this.createStream(currentBot);
    this.streams.set(currentBot.id, stream);
    try {
      if (isLark && !this.botIdentities.has(currentBot.id)) {
        await this.logger.write("info", "正在确认飞书 Bot 身份", maskAppId(currentBot.appId), currentBot.id);
        const identity = await getLarkBotIdentity(currentBot);
        this.botIdentities.set(currentBot.id, identity);
        await this.logger.write("info", "飞书 Bot 身份已确认", `${maskAppId(currentBot.appId)} / ${identity.appName ?? "未命名"} / ${identity.openId}`, currentBot.id);
      }
      await stream.start(currentBot);
      await this.logger.write("info", "机器人事件订阅正在重连", currentBot.name, currentBot.id);
    } catch (error) {
      if (this.streams.get(currentBot.id) === stream) this.streams.delete(currentBot.id);
      this.connectedBotIds.delete(currentBot.id);
      await this.logger.write("error", "机器人重连失败，5 秒后重试", String(error), currentBot.id);
      this.scheduleReconnect(currentBot);
    }
  }

  private emitSnapshot(): void {
    if (this.config) this.emit("snapshot", this.snapshot());
  }

  private enqueueMessage(bot: BotConfig, message: ChatMessage): void {
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

  private async runWithTaskSlot(bot: BotConfig, message: ChatMessage): Promise<void> {
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

  private async handleMessage(bot: BotConfig, message: ChatMessage, existingReaction?: Promise<string>): Promise<void> {
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
    const sessionEvents: SessionTranscriptEvent[] = [{
      time: new Date(startedAt).toISOString(),
      type: "received",
      title: "接收消息",
      body: originalUserText
    }];
    const pushSessionEvent = (event: Omit<SessionTranscriptEvent, "time">): void => {
      sessionEvents.push({ time: new Date().toISOString(), ...event });
      if (sessionEvents.length > 80) sessionEvents.splice(0, sessionEvents.length - 80);
    };
    const pendingReaction = existingReaction ?? this.addPendingReaction(bot, message, startedAt);
    const cancelLongTaskNotice = this.scheduleLongTaskNotice(bot, message, (text) => {
      pushSessionEvent({ type: "notice", title: "长任务自动提示", body: text });
    });

    try {
      const decision = ownerDecision(message);
      if (decision && bot.ownerOpenId && message.senderId === bot.ownerOpenId) {
        const escalation = await getEscalation(bot, decision.id);
        if (!escalation) {
          await this.replyToMessage(bot, message.messageId, `未找到待处理请求 ${decision.id}，可能已处理或编号有误。`);
          return;
        }
        await this.replyToMessage(bot, escalation.messageId, decision.response);
        await this.replyToMessage(bot, message.messageId, `已将处理结果发送给原提问人（请求 ${decision.id}）。`);
        await completeEscalation(bot, decision.id);
        await this.logger.write("success", "Owner 已处理人工请求", `${decision.id} / ${decision.response}`, bot.id);
        return;
      }
      const allowed = new Set(bot.skillNames);
      const botSkills = this.skills.filter((skill) => allowed.has(skill.name));
      const botCapabilities = resolveBotCapabilities(bot, capabilityDefinitions(this.skills, this.customApps, this.suites, this.config.mcpServers));
      const botCapabilityPolicies = new Map(botCapabilityRefs(bot).map((ref) => [`${ref.kind}:${ref.id}`, ref.policy]));
      const botSuiteContexts = this.authorizedSuiteContexts(bot, botSkills);
      let key = conversationKey(message);
      let resumedTask: DeferredTask | null = null;
      const requestedTaskId = continueTaskId(message.text);
      if (requestedTaskId) {
        resumedTask = await getDeferredTask(bot, requestedTaskId);
        if (!resumedTask || resumedTask.status === "completed") {
          await this.replyToMessage(bot, message.messageId, `未找到可继续的任务 ${requestedTaskId}，可能已完成或编号有误。`);
          return;
        }
        key = resumedTask.conversationKey;
        resumedTask.status = "scheduled";
        await updateDeferredTask(bot, resumedTask);
        message = { ...message, text: resumedTask.followUpPrompt };
        await this.replyToMessage(bot, message.messageId, `已调度任务 ${resumedTask.id}，我会等待文件下载和分析完成后回复。`);
      }
      if (["/new", "新对话", "重置会话"].includes(message.text.trim())) {
        await this.sessionStore.clear(bot, key);
        await this.replyToMessage(bot, message.messageId, "已开启新对话，后续消息不会沿用之前的上下文。");
        await this.logger.write("success", "已重置连续会话", key, bot.id);
        return;
      }
      const resourcesDir = path.join(stateRoot(), "bots", bot.id, "messages", message.messageId);
      let enrichedMessage = message;
      const resourceStartedAt = Date.now();
      try {
        enrichedMessage = await this.downloadMessageResources(bot, message, resourcesDir);
        enrichedMessage = await preprocessOfficeResources(enrichedMessage, resourcesDir, this.config.model.multimodalEnabled);
        await cacheMessageResources(bot, enrichedMessage);
        if (enrichedMessage.resources.length > 0) {
          pushSessionEvent({ type: "progress", title: "资源准备", body: `已准备 ${enrichedMessage.resources.length} 个消息资源。` });
          await this.logger.write("info", "已下载飞书消息资源", `${enrichedMessage.resources.length} 个`, bot.id);
        }
      } catch (error) {
        pushSessionEvent({ type: "error", title: "资源准备失败", body: String(error) });
        await this.logger.write("warn", "下载飞书消息资源失败，继续处理文本内容", String(error), bot.id);
      }
      timings.push(`资源 ${formatDelay(Date.now() - resourceStartedAt)}`);
      const command = parseSlashCommand(enrichedMessage.text);
      if (command) {
        const commandResult = await this.executeCommand(bot, {
          conversationKey: key,
          commandName: command.name,
          args: command.args,
          messageId: message.messageId,
          originalUserText,
          baseMessage: enrichedMessage,
          botSkills,
          botCapabilities,
          botCapabilityPolicies,
          replyMode: "reply",
          suiteContexts: botSuiteContexts,
          sessionEvents
        });
        if (commandResult.handled) return;
      }
      const agentStartedAt = Date.now();
      let lastProgressKey = "";
      let lastLoggedProgressKey = "";
      let lastProgressAt = 0;
      const onAgentProgress = (progress: { key: string; text: string }): void => {
        if (progress.key !== lastLoggedProgressKey) {
          lastLoggedProgressKey = progress.key;
          pushSessionEvent({ type: "progress", title: "Agent 工作过程", body: progress.text });
          void this.logger.write("info", "Agent 工作过程", progress.text, bot.id);
        }
        if (!bot.showProgress || progress.key === lastProgressKey || Date.now() - lastProgressAt < 8000) return;
        lastProgressKey = progress.key;
        lastProgressAt = Date.now();
        void this.replyToMessage(bot, message.messageId, `工作进度：${progress.text}`).catch((error) => (
          this.logger.write("warn", "发送工作进度失败", String(error), bot.id)
        ));
      };
      let result = await runClaude(this.config, bot, enrichedMessage, botSkills, key, this.sessionStore.get(bot, key), onAgentProgress, botSuiteContexts);
      const cachedFileRequest = parseLarkCachedFileRequest(result.response);
      if (cachedFileRequest) {
        const helperStartedAt = Date.now();
        const cachedFilesDir = path.join(resourcesDir, "cached-files");
        const larkBot = larkConnectorBot(bot);
        if (!larkBot) throw new Error("LARK_CONNECTOR_NOT_CONFIGURED");
        const helperResult = await materializeLarkCachedFile(larkBot, cachedFileRequest, cachedFilesDir);
        pushSessionEvent({
          type: "progress",
          title: "受控文件缓存",
          body: `${helperResult.cacheHit ? "缓存命中" : "已下载并写入缓存"}：${helperResult.localPath}`
        });
        await this.logger.write(helperResult.cacheHit ? "success" : "info", helperResult.cacheHit ? "飞书文件缓存命中" : "飞书文件已下载并写入缓存", helperResult.localPath, bot.id);
        const helperMessage: ChatMessage = {
          ...enrichedMessage,
          text: [
            cachedFileRequest.prompt,
            "",
            `受控 helper 已准备文件：${helperResult.localPath}`,
            `缓存状态：${helperResult.cacheHit ? "hit" : "miss"}`
          ].join("\n"),
          resources: [{
            key: cachedFileRequest.fileToken,
            type: "file",
            name: path.basename(helperResult.localPath),
            localPath: helperResult.localPath
          }]
        };
        const processedHelperMessage = await preprocessOfficeResources(helperMessage, cachedFilesDir, this.config.model.multimodalEnabled);
        result = await runClaude(this.config, bot, processedHelperMessage, botSkills, key, result.sessionId || this.sessionStore.get(bot, key), onAgentProgress, botSuiteContexts);
        timings.push(`受控文件 ${formatDelay(Date.now() - helperStartedAt)}`);
      }
      timings.push(`Agent ${formatDelay(Date.now() - agentStartedAt)}`);
      const replyStartedAt = Date.now();
      const escalation = parseEscalation(result.response);
      const deferred = parseDeferredTask(result.response);
      let finalReply = result.response;
      if (deferred) {
        const task = await addDeferredTask(bot, deferred, message, key);
        finalReply = `${deferred.summary}\n\n如需继续等待下载并完成深度分析，请回复：/continue ${task.id}`;
        await this.replyToMessage(bot, message.messageId, finalReply);
        await this.logger.write("info", "已创建待确认下载任务", `${task.id} / ${deferred.summary}`, bot.id);
      } else if (escalation && bot.ownerOpenId) {
        const pending = await addEscalation(bot, escalation, message);
        try {
          await this.sendCardToUser(bot, bot.ownerOpenId, escalationCard(bot, pending), `owner-${bot.id}-${pending.id}`);
          finalReply = `这个问题需要人工${pending.type === "approval" ? "授权" : "协助"}，我已私聊 Owner 跟进（请求 ${pending.id}）。`;
          await this.replyToMessage(bot, message.messageId, finalReply);
          await this.logger.write("info", "已向 Owner 发送人工请求", `${pending.id} / ${pending.summary}`, bot.id);
        } catch (error) {
          finalReply = "这个问题需要人工协助，但目前无法联系配置的 Owner。请管理员确认 Owner open_id 正确，并且该用户有应用使用权限。";
          await this.replyToMessage(bot, message.messageId, finalReply);
          await completeEscalation(bot, pending.id);
          await this.logger.write("error", "向 Owner 发送人工请求失败", String(error), bot.id);
        }
      } else {
        await this.replyToMessage(bot, message.messageId, result.response);
      }
      await this.copyFinalReplyToDeliveryRoutes(bot, finalReply);
      pushSessionEvent({ type: "reply", title: "最终回复", body: finalReply });
      if (result.sessionId) await this.sessionStore.set(bot, key, result.sessionId, message.messageId, {
        user: originalUserText,
        assistant: finalReply,
        events: sessionEvents
      });
      if (resumedTask) {
        resumedTask.status = "completed";
        await updateDeferredTask(bot, resumedTask);
      }
      timings.push(`飞书回复 ${formatDelay(Date.now() - replyStartedAt)}`);
      await this.logger.write("success", "消息处理并回复完成", result.response, bot.id);
      await this.logger.write("info", "消息处理耗时", `${timings.join(" / ")} / 总计 ${formatDelay(Date.now() - startedAt)}`, bot.id);
    } catch (error) {
      pushSessionEvent({ type: "error", title: "消息处理失败", body: String(error) });
      await this.logger.write("error", "消息处理失败", String(error), bot.id);
      if (/maximum number of turns|Reached maximum number of turns/i.test(String(error))) {
        await this.replyToMessage(bot, message.messageId, "这次检索和文件处理步骤超过了当前 Agent 最大步数限制，任务已停止。管理员可以在配置中调高“单次 Agent 最大步数”，或让问题更聚焦后重试。").catch(() => undefined);
      } else if (/RAW_LARK_FILE_DOWNLOAD_BLOCKED/.test(String(error))) {
        await this.replyToMessage(bot, message.messageId, "本次任务尝试直接下载或导出飞书文件，已被应用治理拦截。请重试，系统会要求 Agent 使用受控文件缓存协议，以便复用缓存并保持 Bot 隔离。").catch(() => undefined);
      } else if (/LARK_CONNECTOR_NOT_CONFIGURED/.test(String(error))) {
        await this.replyToMessage(bot, message.messageId, "当前 Bot 未配置飞书知识连接器，无法继续下载或导出飞书文件。请管理员在 Bot 的 connectors.lark 中配置飞书凭据后重试。").catch(() => undefined);
      }
    } finally {
      cancelLongTaskNotice();
      const pendingReactionId = await pendingReaction;
      if (pendingReactionId) {
        try {
          await this.removeMessageReaction(bot, message.messageId, pendingReactionId);
          await this.logger.write("info", "已移除处理中表情", bot.name, bot.id);
        } catch (error) {
          await this.logger.write("warn", "移除处理中表情失败", String(error), bot.id);
        }
      }
    }
  }

  private addPendingReaction(bot: BotConfig, message: ChatMessage, startedAt: number): Promise<string> {
    return imProviderForBot(bot).addMessageReaction(bot, message.messageId, bot.pendingReaction || "OnIt")
      .then(async (reactionId) => {
        await this.logger.write("info", "已添加处理中表情", `${bot.name} / ${formatDelay(Date.now() - startedAt)}`, bot.id);
        return reactionId;
      })
      .catch(async (error) => {
        await this.logger.write("warn", "添加处理中表情失败，继续处理消息", String(error), bot.id);
        return "";
      });
  }

  private scheduleLongTaskNotice(bot: BotConfig, message: ChatMessage, onSent?: (text: string) => void): () => void {
    const seconds = Math.floor(Number(bot.longTaskNoticeSeconds ?? 0));
    const text = (bot.longTaskNoticeText ?? "").trim();
    if (seconds <= 0 || !text) return () => undefined;
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      void this.replyToMessage(bot, message.messageId, text)
        .then(() => {
          onSent?.(text);
          return this.logger.write("info", "已发送长任务自动提示", `${seconds}s / ${text}`, bot.id);
        })
        .catch((error) => this.logger.write("warn", "发送长任务自动提示失败", String(error), bot.id));
    }, seconds * 1000);
    return () => {
      if (!fired) clearTimeout(timer);
    };
  }

  private replyToMessage(bot: BotConfig, messageId: string, text: string): Promise<void> {
    return imProviderForBot(bot).replyToMessage(bot, messageId, text);
  }

  private removeMessageReaction(bot: BotConfig, messageId: string, reactionId: string): Promise<void> {
    return imProviderForBot(bot).removeMessageReaction(bot, messageId, reactionId);
  }

  private sendCardToUser(bot: BotConfig, userId: string, card: unknown, idempotencyKey: string): Promise<void> {
    return imProviderForBot(bot).sendCardToUser(bot, userId, card, idempotencyKey);
  }

  private downloadMessageResources(bot: BotConfig, message: ChatMessage, outputDir: string): Promise<ChatMessage> {
    return imProviderForBot(bot).downloadMessageResources(bot, message, outputDir);
  }

  private async copyFinalReplyToDeliveryRoutes(bot: BotConfig, text: string): Promise<void> {
    for (const route of bot.deliveryRoutes ?? []) {
      if (!route.enabled || route.mode !== "copy-final-reply") continue;
      const routeBot = this.deliveryRouteBot(bot, route.provider);
      if (!routeBot) {
        await this.logger.write("warn", "结果转发跳过", `缺少 ${route.provider} connector: ${route.name || route.id}`, bot.id);
        continue;
      }
      try {
        await imProvider(route.provider).sendTextToChat(routeBot, route.chatId, text);
        await this.logger.write("info", "结果已转发", `${route.provider} / ${route.chatId}`, bot.id);
      } catch (error) {
        await this.logger.write("warn", "结果转发失败", `${route.provider} / ${String(error)}`, bot.id);
      }
    }
  }

  private deliveryRouteBot(bot: BotConfig, provider: BotConfig["provider"]): BotConfig | null {
    if ((provider ?? "lark") === primaryProvider(bot)) return bot;
    if (provider === "lark") return larkConnectorBot(bot);
    return null;
  }

  private async refreshAllScheduledTasks(): Promise<void> {
    await Promise.all(this.config.bots.map((bot) => this.refreshBotScheduledTimers(bot)));
  }

  private async refreshBotScheduledTimers(bot: BotConfig): Promise<void> {
    await hydrateBotScheduledTasks(bot);
    bot.scheduledTasks = refreshBotScheduledTasks(bot);
    for (const [key, timer] of this.scheduledTaskTimers.entries()) {
      if (!key.startsWith(`${bot.id}:`)) continue;
      clearTimeout(timer);
      this.scheduledTaskTimers.delete(key);
    }
    void persistBotScheduledTasks(bot);
    for (const task of bot.scheduledTasks ?? []) {
      if (!task.enabled || !task.nextRunAt) continue;
      const delay = Math.max(1000, Date.parse(task.nextRunAt) - Date.now());
      const timer = setTimeout(() => void this.runScheduledTask(bot.id, task.id), delay);
      this.scheduledTaskTimers.set(`${bot.id}:${task.id}`, timer);
    }
  }

  private async runScheduledTask(botId: string, taskId: string, trigger: "scheduled" | "manual" = "scheduled"): Promise<void> {
    const bot = this.config.bots.find((item) => item.id === botId);
    const task = bot?.scheduledTasks?.find((item) => item.id === taskId);
    if (!bot || !task) return;
    const startedAt = new Date();
    const runKey = `${bot.id}:${task.id}`;
    const workflowSteps: WorkflowStepExecutionEvent[] = [];
    if (this.activeScheduledRuns.has(runKey)) {
      await this.completeScheduledTask(bot, task, startedAt, "skipped", "上一次运行仍未结束", trigger);
      await this.refreshBotScheduledTimers(bot);
      return;
    }
    this.activeScheduledRuns.add(runKey);
    try {
      if (!bot.enabled) {
        await this.completeScheduledTask(bot, task, startedAt, "skipped", "Bot 已停用", trigger);
        return;
      }
      if (!task.enabled) {
        await this.completeScheduledTask(bot, task, startedAt, "skipped", "任务已停用", trigger);
        return;
      }
      if (!this.config.model.baseUrl || !this.config.model.model || !this.config.model.apiKey) {
        const detail = "模型配置不完整";
        await this.completeScheduledTask(bot, task, startedAt, "failed", detail, trigger);
        await this.notifyScheduledTaskFailure(bot, task, detail, trigger);
        return;
      }
      const limit = Math.max(1, Math.floor(this.config.runtime.maxConcurrentTasks || 1));
      const release = await this.taskLimiter.acquire(limit);
      try {
        const response = await this.executeScheduledTask(bot, task, startedAt, workflowSteps);
        await imProviderForBot(bot).sendTextToChat(bot, task.delivery.chatId, response);
        await this.completeScheduledTask(bot, task, startedAt, "success", scheduledRunDetail(response, workflowSteps), trigger);
      } finally {
        release();
      }
    } catch (error) {
      const detail = scheduledRunDetail(String(error), workflowSteps);
      await this.completeScheduledTask(bot, task, startedAt, "failed", detail, trigger);
      await this.notifyScheduledTaskFailure(bot, task, detail, trigger);
    } finally {
      this.activeScheduledRuns.delete(runKey);
      if (trigger === "scheduled") await this.refreshBotScheduledTimers(bot);
      this.emitSnapshot();
    }
  }

  private async executeScheduledTask(bot: BotConfig, task: ScheduledTask, startedAt: Date, workflowSteps: WorkflowStepExecutionEvent[] = []): Promise<string> {
    const conversation = `scheduled:${task.id}`;
    const messageId = `scheduled-${task.id}-${startedAt.getTime()}`;
    const baseMessage: ChatMessage = {
      eventId: messageId,
      messageId,
      chatId: task.delivery.chatId,
      chatType: "scheduled",
      senderId: bot.id,
      messageType: "text",
      text: task.target.prompt,
      resources: [],
      receivedAt: startedAt.toISOString(),
      raw: { scheduledTaskId: task.id }
    };
    const allowed = new Set(bot.skillNames);
    const botSkills = this.skills.filter((skill) => allowed.has(skill.name));
    const botCapabilities = resolveBotCapabilities(bot, capabilityDefinitions(this.skills, this.customApps, this.suites, this.config.mcpServers));
    const botCapabilityPolicies = new Map(botCapabilityRefs(bot).map((ref) => [`${ref.kind}:${ref.id}`, ref.policy]));
    const botSuiteContexts = this.authorizedSuiteContexts(bot, botSkills);
    if (task.target.type === "command") {
      const result = await this.executeCommand(bot, {
        conversationKey: conversation,
        commandName: task.target.commandName ?? "",
        args: task.target.prompt,
        messageId,
        originalUserText: `/${task.target.commandName} ${task.target.prompt}`.trim(),
        baseMessage,
        botSkills,
        botCapabilities,
        botCapabilityPolicies,
        replyMode: "capture",
        trigger: "scheduled",
        suiteContexts: botSuiteContexts,
        onWorkflowStep: (event) => {
          workflowSteps.push(event);
          void this.logWorkflowStep(bot, event, `定时任务 ${task.name}`);
        }
      });
      if (!result.response) throw new Error(`定时任务 ${task.name} 的命令目标未返回结果`);
      return result.response;
    }
    if (task.target.type === "capability") {
      if (!task.target.capability) throw new Error(`定时任务 ${task.name} 缺少 capability 目标`);
      const approvalReason = capabilityOwnerApprovalReason(task.target.capability, botCapabilityPolicies, this.customApps);
      if (approvalReason) {
        await this.auditCapabilityUse(bot, {
          trigger: "scheduled",
          source: `定时任务 ${task.name}`,
          capability: auditCapability(task.target.capability.kind, task.target.capability.id),
          status: "approval-required",
          detail: approvalReason
        });
        throw new Error(`定时任务 ${task.name} 指向的能力需要 Owner 审批：${approvalReason}`);
      }
      const binding = resolveExecutableCapabilityBinding({
        bot,
        capability: task.target.capability,
        trigger: "scheduled",
        botSkills,
        customApps: this.customApps,
        mcpServers: this.config.mcpServers,
        suites: this.suites,
        suiteContexts: botSuiteContexts,
        capabilityPolicies: botCapabilityPolicies,
        errorLabel: `定时任务 ${task.name}`
      });
      const started = Date.now();
      try {
        const response = await executeCapabilityTarget({
          config: this.config,
          bot,
          conversationKey: conversation,
          messageId,
          originalUserText: `[scheduled] ${task.name}`,
          baseMessage,
          prompt: task.target.prompt,
          binding,
          resumeSessionId: this.sessionStore.get(bot, conversation),
          onProgress: (text) => {
            void this.logger.write("info", "Agent 工作过程", `定时任务 ${task.name} / ${text}`, bot.id);
          },
          onWorkflowStep: (event) => {
            workflowSteps.push(event);
            void this.logWorkflowStep(bot, event, `定时任务 ${task.name}`);
          },
          onSessionSaved: (sessionId, assistant) => this.sessionStore.set(bot, conversation, sessionId, messageId, { user: `[scheduled] ${task.name}`, assistant })
        });
        await this.auditCapabilityUse(bot, {
          trigger: "scheduled",
          source: `定时任务 ${task.name}`,
          capability: auditCapability(binding.capability.kind, binding.capability.id, binding.capability.name),
          status: "success",
          durationMs: Date.now() - started
        });
        return response;
      } catch (error) {
        await this.auditCapabilityUse(bot, {
          trigger: "scheduled",
          source: `定时任务 ${task.name}`,
          capability: auditCapability(binding.capability.kind, binding.capability.id, binding.capability.name),
          status: "failed",
          detail: String(error instanceof Error ? error.message : error),
          durationMs: Date.now() - started
        });
        throw error;
      }
    }
    const result = await runClaude(this.config, bot, baseMessage, botSkills, conversation, this.sessionStore.get(bot, conversation), (progress) => {
      void this.logger.write("info", "Agent 工作过程", `定时任务 ${task.name} / ${progress.text}`, bot.id);
    }, botSuiteContexts);
    if (result.sessionId) {
      await this.sessionStore.set(bot, conversation, result.sessionId, messageId, { user: `[scheduled] ${task.name}`, assistant: result.response });
    }
    return result.response;
  }

  private async completeScheduledTask(bot: BotConfig, task: ScheduledTask, startedAt: Date, status: "success" | "failed" | "skipped", detail: string, trigger: "scheduled" | "manual" = "scheduled"): Promise<void> {
    const previousNextRunAt = task.nextRunAt;
    const previousRetryAt = task.retryAt;
    task.lastRunAt = startedAt.toISOString();
    task.lastStatus = status;
    const retryDetail = this.updateScheduledTaskRetryState(task, startedAt, status, detail, trigger);
    task.nextRunAt = trigger === "manual" && previousNextRunAt && !(status === "success" && previousRetryAt) ? previousNextRunAt : nextTaskRun(task, startedAt);
    const recordDetail = trigger === "manual" ? `手动触发\n${retryDetail}` : retryDetail;
    await persistBotScheduledTasks(bot);
    await appendScheduledTaskRun({
      taskId: task.id,
      botId: bot.id,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      status,
      detail: recordDetail
    });
    await this.logger.write(status === "success" ? "success" : status === "failed" ? "error" : "warn", "定时任务运行完成", `${task.name} / ${status}${trigger === "manual" ? " / 手动触发" : ""}`, bot.id);
  }

  private async notifyScheduledTaskFailure(bot: BotConfig, task: ScheduledTask, detail: string, trigger: "scheduled" | "manual"): Promise<void> {
    const text = [
      `定时任务失败：${task.name}`,
      `Bot：${bot.name}`,
      `触发：${trigger === "manual" ? "手动执行" : "计划执行"}`,
      `详情：${trimForLog(detail, 600)}`
    ].join("\n");
    try {
      await imProviderForBot(bot).sendTextToChat(bot, task.delivery.chatId, text);
      await this.logger.write("warn", "已发送定时任务失败告警", `${task.name} / ${task.delivery.chatId}`, bot.id);
    } catch (error) {
      await this.logger.write("warn", "定时任务失败告警发送失败", `${task.name} / ${String(error)}`, bot.id);
    }
  }

  private updateScheduledTaskRetryState(task: ScheduledTask, startedAt: Date, status: "success" | "failed" | "skipped", detail: string, trigger: "scheduled" | "manual"): string {
    if (status === "success") {
      task.failureCount = 0;
      task.retryAt = undefined;
      task.pausedReason = undefined;
      return detail;
    }
    if (status !== "failed" || trigger === "manual") return detail;
    const maxRetries = Math.max(0, Math.floor(task.retry?.maxRetries ?? 0));
    const delayMinutes = Math.max(1, Math.floor(task.retry?.delayMinutes ?? 10));
    if (maxRetries <= 0) {
      task.failureCount = (task.failureCount ?? 0) + 1;
      task.retryAt = undefined;
      return detail;
    }
    task.failureCount = (task.failureCount ?? 0) + 1;
    if (task.failureCount <= maxRetries) {
      task.retryAt = new Date(startedAt.getTime() + delayMinutes * 60_000).toISOString();
      return `${detail}\n重试：第 ${task.failureCount}/${maxRetries} 次将在 ${task.retryAt} 执行`;
    }
    task.retryAt = undefined;
    task.pausedReason = `连续失败 ${task.failureCount} 次，已超过最大重试次数 ${maxRetries}`;
    return `${detail}\n暂停原因：${task.pausedReason}`;
  }

  private async executeCommand(bot: BotConfig, options: {
    conversationKey: string;
    commandName: string;
    args: string;
    messageId: string;
    originalUserText: string;
    baseMessage: ChatMessage;
    botSkills: SkillSummary[];
    botCapabilities: ReturnType<typeof resolveBotCapabilities>;
    botCapabilityPolicies: Map<string, ReturnType<typeof botCapabilityRefs>[number]["policy"]>;
    replyMode: "reply" | "capture";
    trigger?: "command" | "scheduled";
    suiteContexts: ClaudeSuiteContext[];
    sessionEvents?: SessionTranscriptEvent[];
    onWorkflowStep?: (event: WorkflowStepExecutionEvent) => void;
  }): Promise<{ handled: boolean; response?: string }> {
    const auditTrigger = options.trigger ?? "command";
    if (options.commandName === "help") {
      const response = commandHelpText(bot.commandBindings);
      if (options.replyMode === "reply") await this.replyToMessage(bot, options.messageId, response);
      return { handled: true, response };
    }
    const binding = findCommandBinding(bot.commandBindings, options.commandName);
    if (!binding) {
      if (options.replyMode === "reply") {
        await this.replyToMessage(bot, options.messageId, `未找到命令 /${options.commandName}，请联系管理员确认该 Bot 是否已配置此命令。`);
      }
      return { handled: true };
    }
    const capability = options.botCapabilities.find((item) => item.kind === binding.target.capability.kind && item.id === binding.target.capability.id);
    if (!capability) {
      if (options.replyMode === "reply") {
        await this.replyToMessage(bot, options.messageId, `命令 /${options.commandName} 指向的能力当前未授权给该 Bot。`);
      }
      return { handled: true };
    }
    const approvalReason = capabilityOwnerApprovalReason(binding.target.capability, options.botCapabilityPolicies, this.customApps);
    if (approvalReason) {
      await this.auditCapabilityUse(bot, {
        trigger: auditTrigger,
        source: auditTrigger === "scheduled" ? `定时命令 /${options.commandName}` : `命令 /${options.commandName}`,
        capability: auditCapability(binding.target.capability.kind, binding.target.capability.id, capability.name),
        status: "approval-required",
        detail: approvalReason
      });
      if (options.replyMode === "capture") throw new Error(`命令 /${options.commandName} 指向的能力需要 Owner 审批：${approvalReason}`);
      const response = await this.requestCapabilityOwnerApproval(bot, options.baseMessage, {
        label: `命令 /${options.commandName}`,
        capability: binding.target.capability,
        reason: approvalReason,
        userInput: options.originalUserText
      });
      await this.replyToMessage(bot, options.messageId, response);
      return { handled: true, response };
    }
    let executableBinding;
    try {
      executableBinding = resolveExecutableCapabilityBinding({
        bot,
        capability: binding.target.capability,
        trigger: "command",
        botSkills: options.botSkills,
        customApps: this.customApps,
        mcpServers: this.config.mcpServers,
        suites: this.suites,
        suiteContexts: options.suiteContexts,
        capabilityPolicies: options.botCapabilityPolicies,
        errorLabel: `命令 /${options.commandName}`
      });
    } catch (error) {
      if (options.replyMode === "reply") {
        await this.replyToMessage(bot, options.messageId, String(error instanceof Error ? error.message : error));
      }
      return { handled: true };
    }
    const started = Date.now();
    const response = await executeCapabilityTarget({
      config: this.config,
      bot,
      conversationKey: options.conversationKey,
      messageId: options.messageId,
      originalUserText: options.originalUserText,
      baseMessage: options.baseMessage,
      prompt: commandPrompt(binding, options.args),
      binding: executableBinding,
      resumeSessionId: this.sessionStore.get(bot, options.conversationKey),
      onProgress: (text) => {
        options.sessionEvents?.push({ time: new Date().toISOString(), type: "progress", title: "Agent 工作过程", body: `命令 /${options.commandName} / ${text}` });
        void this.logger.write("info", "Agent 工作过程", `命令 /${options.commandName} / ${text}`, bot.id);
      },
      onWorkflowStep: (event) => {
        options.onWorkflowStep?.(event);
        void this.logWorkflowStep(bot, event, `命令 /${options.commandName}`);
      },
      onSessionSaved: (sessionId, assistant) => this.sessionStore.set(bot, options.conversationKey, sessionId, options.messageId, {
        user: options.originalUserText,
        assistant,
        events: options.sessionEvents
          ? [...options.sessionEvents, { time: new Date().toISOString(), type: "reply", title: "最终回复", body: assistant }]
          : undefined
      })
    }).then(async (value) => {
      await this.auditCapabilityUse(bot, {
        trigger: auditTrigger,
        source: auditTrigger === "scheduled" ? `定时命令 /${options.commandName}` : `命令 /${options.commandName}`,
        capability: auditCapability(executableBinding.capability.kind, executableBinding.capability.id, executableBinding.capability.name),
        status: "success",
        durationMs: Date.now() - started
      });
      return value;
    }).catch(async (error) => {
      await this.auditCapabilityUse(bot, {
        trigger: auditTrigger,
        source: auditTrigger === "scheduled" ? `定时命令 /${options.commandName}` : `命令 /${options.commandName}`,
        capability: auditCapability(executableBinding.capability.kind, executableBinding.capability.id, executableBinding.capability.name),
        status: "failed",
        detail: String(error instanceof Error ? error.message : error),
        durationMs: Date.now() - started
      });
      if (options.replyMode === "reply") await this.replyToMessage(bot, options.messageId, String(error instanceof Error ? error.message : error));
      return "";
    });
    if (!response) return { handled: true };
    if (options.replyMode === "reply") await this.replyToMessage(bot, options.messageId, response);
    await this.logger.write("success", "命令执行完成", `/${options.commandName} -> ${binding.target.capability.kind}:${binding.target.capability.id}`, bot.id);
    return { handled: true, response };
  }

  private async logWorkflowStep(bot: BotConfig, event: WorkflowStepExecutionEvent, label: string): Promise<void> {
    const statusText = event.status === "started" ? "开始" : event.status === "success" ? "完成" : "失败";
    const detail = [
      `${label} / ${event.workflowName} / ${event.stepName} / ${statusText}`,
      event.attempt && event.maxAttempts && event.maxAttempts > 1 ? `尝试: ${event.attempt}/${event.maxAttempts}` : "",
      event.output ? `输出摘要: ${trimForLog(event.output)}` : "",
      event.error ? `错误: ${trimForLog(event.error)}` : ""
    ].filter(Boolean).join("\n");
    await this.logger.write(event.status === "failed" ? "error" : "info", "Workflow 步骤", detail, bot.id);
  }

  private async auditCapabilityUse(bot: BotConfig, record: Omit<Parameters<typeof appendCapabilityAudit>[0], "at" | "botId">): Promise<void> {
    await appendCapabilityAudit({
      at: new Date().toISOString(),
      botId: bot.id,
      ...record
    }).catch((error) => this.logger.write("warn", "能力使用审计写入失败", String(error), bot.id));
  }

  private async requestCapabilityOwnerApproval(bot: BotConfig, message: ChatMessage, options: {
    label: string;
    capability: { kind: "skill" | "mcp" | "app" | "suite" | "workflow"; id: string };
    reason: string;
    userInput: string;
  }): Promise<string> {
    if (!bot.ownerOpenId) return `${options.label} 指向的能力需要 Owner 审批，但该 Bot 未配置 Owner open_id。`;
    const pending = await addEscalation(bot, {
      id: randomUUID().slice(0, 8),
      type: "approval",
      summary: [
        `${options.label} 请求执行能力 ${options.capability.kind}:${options.capability.id}`,
        `原因：${options.reason}`,
        `用户输入：${options.userInput}`
      ].join("\n")
    }, message);
    try {
      await this.sendCardToUser(bot, bot.ownerOpenId, escalationCard(bot, pending), `owner-${bot.id}-${pending.id}`);
      await this.logger.write("info", "已向 Owner 发送能力审批请求", `${pending.id} / ${options.capability.kind}:${options.capability.id}`, bot.id);
      return `${options.label} 需要 Owner 审批，我已私聊 Owner 跟进（请求 ${pending.id}）。`;
    } catch (error) {
      await completeEscalation(bot, pending.id);
      await this.logger.write("error", "向 Owner 发送能力审批请求失败", String(error), bot.id);
      return `${options.label} 需要 Owner 审批，但目前无法联系配置的 Owner。请管理员确认 Owner open_id 正确，并且该用户有应用使用权限。`;
    }
  }

  private authorizedSuiteContexts(bot: BotConfig, botSkills: SkillSummary[]): ClaudeSuiteContext[] {
    const allowedApps = new Set(
      (bot.capabilityRefs ?? [])
        .filter((ref) => ref.enabled && ref.kind === "app" && ref.policy?.allowAgentUse !== false)
        .map((ref) => ref.id)
    );
    const allowedMcps = new Set(
      (bot.capabilityRefs ?? [])
        .filter((ref) => ref.enabled && ref.kind === "mcp" && ref.policy?.allowAgentUse !== false)
        .map((ref) => ref.id)
    );
    const allowedSuites = new Set(
      (bot.capabilityRefs ?? [])
        .filter((ref) => ref.enabled && ref.kind === "suite" && ref.policy?.allowAgentUse !== false)
        .map((ref) => ref.id)
    );
    return this.suites
      .filter((suite) => allowedSuites.has(suite.id))
      .map((suite) => ({
        suite,
        authorizedSkills: botSkills.filter((skill) => suite.skills.includes(skill.name)).map((skill) => skill.name),
        authorizedApps: suite.apps.filter((id) => allowedApps.has(id)),
        authorizedMcpServers: suite.mcpServers.filter((id) => allowedMcps.has(id))
      }));
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

function eventDelayMs(message: ChatMessage): number | null {
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

function scheduledRunDetail(response: string, workflowSteps: WorkflowStepExecutionEvent[]): string {
  if (workflowSteps.length === 0) return response;
  return [
    response,
    "",
    "Workflow steps:",
    ...workflowSteps.map((step) => {
      const status = step.status === "started" ? "started" : step.status === "success" ? "success" : "failed";
      const attempt = step.attempt && step.maxAttempts && step.maxAttempts > 1 ? ` attempt=${step.attempt}/${step.maxAttempts}` : "";
      const tail = step.error
        ? ` error=${trimForLog(step.error)}`
        : step.output ? ` output=${trimForLog(step.output)}` : "";
      return `- ${step.workflowName} / ${step.stepName}: ${status}${attempt}${tail}`;
    })
  ].join("\n");
}

function trimForLog(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
