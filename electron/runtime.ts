import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { runClaude } from "./claude.js";
import { LarkEventStream, replyToMessage } from "./lark-cli.js";
import { Logger } from "./logger.js";
import { discoverSkills } from "./skills.js";
import { stateRoot } from "./paths.js";
import type { AppConfig, LarkMessage, RuntimeSnapshot, SkillSummary } from "./types.js";

export class QuarkfanToolsRuntime extends EventEmitter {
  readonly logger = new Logger();
  private stream = new LarkEventStream();
  private running = false;
  private connected = false;
  private activeTasks = 0;
  private config!: AppConfig;
  private skills: SkillSummary[] = [];
  private processed = new Set<string>();

  constructor() {
    super();
    this.stream.on("message", (message: LarkMessage) => void this.handleMessage(message));
    this.stream.on("stderr", (text: string) => void this.logger.write("warn", "飞书连接输出", text));
    this.stream.on("exit", ({ code, signal }) => {
      this.connected = false;
      this.emitSnapshot();
      if (this.running) void this.logger.write("error", "飞书事件订阅已退出", `code=${code} signal=${signal}`);
    });
    this.logger.on("entry", (entry) => this.emit("log", entry));
  }

  async initialize(): Promise<void> {
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    await this.loadProcessed();
    this.emitSnapshot();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.config = await loadConfig();
    this.skills = await discoverSkills();
    this.running = true;
    await this.logger.write("info", "正在启动 QuarkfanTools", `${this.skills.length} 个 Skill`);
    try {
      await this.stream.start(this.config);
      this.connected = true;
      await this.logger.write("success", "飞书事件订阅已启动", `身份：${this.config.lark.receiveIdentity}`);
    } catch (error) {
      this.running = false;
      await this.logger.write("error", "启动失败", String(error));
      throw error;
    } finally {
      this.emitSnapshot();
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.connected = false;
    await this.stream.stop();
    await this.logger.write("info", "QuarkfanTools 已停止");
    this.emitSnapshot();
  }

  snapshot(): RuntimeSnapshot {
    return {
      running: this.running,
      larkConnected: this.connected,
      activeTasks: this.activeTasks,
      skills: this.skills,
      config: this.config
    };
  }

  private emitSnapshot(): void {
    if (this.config) this.emit("snapshot", this.snapshot());
  }

  private async handleMessage(message: LarkMessage): Promise<void> {
    if (this.processed.has(message.eventId)) return;
    this.processed.add(message.eventId);
    await this.saveProcessed();
    this.activeTasks += 1;
    this.emitSnapshot();
    await this.logger.write("info", "收到飞书消息", message.text);
    try {
      const response = await runClaude(this.config, message, this.skills);
      await replyToMessage(this.config, message.messageId, response);
      await this.logger.write("success", "消息处理并回复完成", response);
    } catch (error) {
      await this.logger.write("error", "消息处理失败", String(error));
    } finally {
      this.activeTasks -= 1;
      this.emitSnapshot();
    }
  }

  private async loadProcessed(): Promise<void> {
    try {
      const values = JSON.parse(await readFile(path.join(stateRoot(), "processed.json"), "utf8")) as string[];
      this.processed = new Set(values);
    } catch {
      this.processed = new Set();
    }
  }

  private async saveProcessed(): Promise<void> {
    await mkdir(stateRoot(), { recursive: true });
    await writeFile(path.join(stateRoot(), "processed.json"), `${JSON.stringify([...this.processed].slice(-5000), null, 2)}\n`, "utf8");
  }
}
