import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { runClaude } from "./claude.js";
import { addMessageReaction, downloadMessageResources, LarkEventStream, removeMessageReaction, replyToMessage } from "./lark-cli.js";
import { Logger } from "./logger.js";
import { preprocessOfficeResources } from "./office.js";
import { discoverSkills } from "./skills.js";
import { stateRoot } from "./paths.js";
import { conversationKey } from "./conversation.js";
import { SessionStore } from "./sessions.js";
import { syncSkillMarket } from "./skill-market.js";
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
  private activeTasks = 0;
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
      activeTasks: this.activeTasks,
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
      .then(() => this.handleMessage(bot, message))
      .finally(() => {
        if (this.conversationTasks.get(key) === task) this.conversationTasks.delete(key);
      });
    this.conversationTasks.set(key, task);
  }

  private async handleMessage(bot: BotConfig, message: LarkMessage): Promise<void> {
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
    this.activeTasks += 1;
    this.emitSnapshot();
    let pendingReactionId = "";

    try {
      try {
        pendingReactionId = await addMessageReaction(bot, message.messageId, bot.pendingReaction || "OnIt");
        await this.logger.write("info", "已添加处理中表情", bot.name, bot.id);
      } catch (error) {
        await this.logger.write("warn", "添加处理中表情失败，继续处理消息", String(error), bot.id);
      }
      const allowed = new Set(bot.skillNames);
      const botSkills = this.skills.filter((skill) => allowed.has(skill.name));
      const key = conversationKey(message);
      if (["/new", "新对话", "重置会话"].includes(message.text.trim())) {
        await this.sessionStore.clear(bot, key);
        await replyToMessage(bot, message.messageId, "已开启新对话，后续消息不会沿用之前的上下文。");
        await this.logger.write("success", "已重置连续会话", key, bot.id);
        return;
      }
      const resourcesDir = path.join(stateRoot(), "bots", bot.id, "messages", message.messageId);
      let enrichedMessage = message;
      try {
        enrichedMessage = await downloadMessageResources(bot, message, resourcesDir);
        enrichedMessage = await preprocessOfficeResources(enrichedMessage, resourcesDir, this.config.model.multimodalEnabled);
        if (enrichedMessage.resources.length > 0) {
          await this.logger.write("info", "已下载飞书消息资源", `${enrichedMessage.resources.length} 个`, bot.id);
        }
      } catch (error) {
        await this.logger.write("warn", "下载飞书消息资源失败，继续处理文本内容", String(error), bot.id);
      }
      const result = await runClaude(this.config, bot, enrichedMessage, botSkills, key, this.sessionStore.get(bot, key));
      if (result.sessionId) await this.sessionStore.set(bot, key, result.sessionId, message.messageId);
      await replyToMessage(bot, message.messageId, result.response);
      await this.logger.write("success", "消息处理并回复完成", result.response, bot.id);
    } catch (error) {
      await this.logger.write("error", "消息处理失败", String(error), bot.id);
    } finally {
      if (pendingReactionId) {
        try {
          await removeMessageReaction(bot, message.messageId, pendingReactionId);
          await this.logger.write("info", "已移除处理中表情", bot.name, bot.id);
        } catch (error) {
          await this.logger.write("warn", "移除处理中表情失败", String(error), bot.id);
        }
      }
      this.activeTasks -= 1;
      this.emitSnapshot();
    }
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
