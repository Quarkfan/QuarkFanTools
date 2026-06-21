import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import { app } from "electron";
import path from "node:path";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { discoverSkills } from "./skills.js";
import { syncSkillMarket } from "./skill-market.js";
import { maskAppId, runningBotWithSameAppId } from "./bot-identity.js";
import { stateRoot } from "./paths.js";
import type { AppConfig, BotConfig, LogEntry, RuntimeSnapshot, SkillSummary } from "./types.js";

interface WorkerRecord {
  botId: string;
  child: ChildProcess;
  snapshot: RuntimeSnapshot | null;
  connected: boolean;
}

type WorkerMessage =
  | { type: "log"; payload: LogEntry }
  | { type: "snapshot"; payload: RuntimeSnapshot }
  | { type: "error"; payload: string };

export class QuarkfanToolsSupervisor extends EventEmitter {
  readonly logger = new Logger();
  private workers = new Map<string, WorkerRecord>();
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
    this.emitSnapshot();
  }

  async start(): Promise<void> {
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    const bots = this.config.bots.filter((bot) => bot.enabled && bot.appId && bot.appSecret);
    await this.logger.write("info", "正在启动 QuarkfanTools", `${bots.length} 个机器人，${this.skills.length} 个 Skill`);
    await this.writeIsolationModeLog();
    for (const bot of bots) {
      await this.startBot(bot.id);
    }
  }

  async startBot(botId: string): Promise<void> {
    if (this.workers.has(botId)) {
      await this.logger.write("info", "机器人已在运行或正在连接", botId, botId);
      return;
    }
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    const bot = this.config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    if (!bot.enabled) throw new Error("机器人已停用，请先在配置中启用");
    if (!bot.appId || !bot.appSecret) throw new Error("机器人 App ID 或 App Secret 未配置");
    const conflictingBot = runningBotWithSameAppId(bot, this.config.bots, this.workers.keys());
    if (conflictingBot) {
      const message = `飞书 App ID ${maskAppId(bot.appId)} 已被“${conflictingBot.name}”监听。一个飞书应用同一时间只能对应一个本地 Bot；同一机器人下的不同角色请用 Skill、命令或套件路由。`;
      await this.logger.write("error", "机器人启动失败", message, bot.id);
      throw new Error(message);
    }
    if (!this.config.model.baseUrl || !this.config.model.model || !this.config.model.apiKey) {
      throw new Error("Claude 兼容模型连接未完整配置");
    }
    await this.writeIsolationModeLog(bot);
    await mkdir(this.botTmpDir(bot), { recursive: true });
    await this.logger.write("info", "正在启动 Bot 隔离进程", bot.name, bot.id);
    const child = this.spawnWorker(bot);
    const record: WorkerRecord = { botId: bot.id, child, snapshot: null, connected: false };
    this.workers.set(bot.id, record);
    child.on("message", (message: WorkerMessage) => this.handleWorkerMessage(record, message));
    child.on("exit", (code, signal) => {
      this.workers.delete(bot.id);
      void this.logger.write("warn", "Bot 隔离进程已退出", `code=${code} signal=${signal}`, bot.id);
      this.emitSnapshot();
    });
    child.on("error", (error) => {
      this.workers.delete(bot.id);
      void this.logger.write("error", "Bot 隔离进程启动失败", String(error), bot.id);
      this.emitSnapshot();
    });
    child.send({ type: "start", botId: bot.id });
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    const workers = [...this.workers.values()];
    this.workers.clear();
    await Promise.all(workers.map((worker) => this.stopWorker(worker)));
    await this.logger.write("info", "QuarkfanTools 已停止");
    this.emitSnapshot();
  }

  async stopBot(botId: string): Promise<void> {
    const worker = this.workers.get(botId);
    this.workers.delete(botId);
    if (worker) await this.stopWorker(worker);
    const bot = this.config.bots.find((item) => item.id === botId);
    await this.logger.write("info", "机器人监听已停止", bot?.name, botId);
    this.emitSnapshot();
  }

  async restartRunningBots(reason: string): Promise<void> {
    const botIds = [...this.workers.keys()];
    if (botIds.length === 0) return;
    await this.logger.write("warn", "正在重建 Bot 隔离进程", `${reason} / ${botIds.length} 个机器人`);
    for (const botId of botIds) {
      await this.stopBot(botId);
      await this.startBot(botId);
    }
  }

  async reloadScheduledTasks(botId: string): Promise<void> {
    const worker = this.workers.get(botId);
    if (worker) worker.child.send({ type: "reload-scheduled-tasks", botId });
    await this.logger.write("info", "已请求 Bot worker 重新加载定时任务", botId, botId);
  }

  async runScheduledTaskNow(botId: string, taskId: string): Promise<void> {
    const worker = this.workers.get(botId);
    if (!worker) throw new Error("机器人未启动，暂不能手动运行定时任务");
    worker.child.send({ type: "run-scheduled-task", botId, taskId });
    await this.logger.write("info", "已请求 Bot worker 手动运行定时任务", taskId, botId);
  }

  snapshot(): RuntimeSnapshot {
    const workerSnapshots = [...this.workers.values()].map((worker) => worker.snapshot).filter((item): item is RuntimeSnapshot => Boolean(item));
    const runningBotIds = [...this.workers.keys()];
    const connectedBotIds = workerSnapshots.flatMap((snapshot) => snapshot.connectedBotIds);
    const readyBotIds = [...this.workers.values()].filter((worker) => worker.connected).map((worker) => worker.botId);
    return {
      running: runningBotIds.length > 0,
      runningBotIds,
      connectedBotIds,
      readyBotIds,
      scheduledTaskCount: workerSnapshots.reduce((sum, snapshot) => sum + (snapshot.scheduledTaskCount ?? 0), 0),
      workerPids: Object.fromEntries([...this.workers.entries()]
        .map(([botId, worker]) => [botId, worker.child.pid])
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")),
      activeTasks: workerSnapshots.reduce((sum, snapshot) => sum + snapshot.activeTasks, 0),
      queuedTasks: workerSnapshots.reduce((sum, snapshot) => sum + snapshot.queuedTasks, 0),
      skills: this.skills,
      config: this.config
    };
  }

  private spawnWorker(bot: BotConfig): ChildProcess {
    const workerPath = path.join(import.meta.dirname, "bot-worker.js");
    const child = spawn(process.execPath, [workerPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        QFT_IS_PACKAGED: app.isPackaged ? "1" : "0",
        QFT_RESOURCES_PATH: process.resourcesPath,
        QFT_USER_DATA_PATH: app.getPath("userData"),
        QFT_APP_DATA_PATH: app.getPath("appData"),
        QFT_APP_VERSION: app.getVersion(),
        QFT_BOT_ID: bot.id,
        TMPDIR: this.botTmpDir(bot)
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    return child;
  }

  private botTmpDir(bot: BotConfig): string {
    return path.join(stateRoot(), "bots", bot.id, "tmp");
  }

  private async writeIsolationModeLog(bot?: BotConfig): Promise<void> {
    const mode = this.config.runtime.botIsolationMode ?? "process";
    if (mode === "process") {
      await this.logger.write("info", "Bot 运行隔离模式", "process worker", bot?.id);
      return;
    }
    await this.logger.write(
      "warn",
      "Bot 运行隔离模式暂回退到 process worker",
      `${mode} 已配置；1.7.0 先启用进程级隔离，Docker 容器隔离将在后续 driver 中接入。`,
      bot?.id
    );
  }

  private handleWorkerMessage(worker: WorkerRecord, message: WorkerMessage): void {
    if (message.type === "log") {
      this.logger.record(message.payload);
      return;
    }
    if (message.type === "snapshot") {
      worker.snapshot = message.payload;
      worker.connected = message.payload.connectedBotIds.includes(worker.botId);
      this.emitSnapshot();
      return;
    }
    if (message.type === "error") {
      void this.logger.write("error", "Bot 隔离进程错误", message.payload, worker.botId);
    }
  }

  private async stopWorker(worker: WorkerRecord): Promise<void> {
    if (worker.child.exitCode !== null || worker.child.killed) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (worker.child.exitCode === null) worker.child.kill("SIGKILL");
        resolve();
      }, 5000);
      worker.child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      worker.child.send({ type: "stop" }, (error) => {
        if (error) worker.child.kill("SIGTERM");
      });
    });
  }

  private emitSnapshot(): void {
    if (this.config) this.emit("snapshot", this.snapshot());
  }
}
