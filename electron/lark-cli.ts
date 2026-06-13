import { app, shell } from "electron";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { projectRoot, stateRoot } from "./paths.js";
import type { AppConfig, LarkMessage } from "./types.js";
import { normalizeLarkEvent } from "./lark-event.js";

function bundledLarkBinary(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime", "lark-cli", "bin", "lark-cli")
    : path.join(projectRoot(), "node_modules", "@larksuite", "cli", "bin", "lark-cli");
}

export async function resolveLarkCommand(config: AppConfig): Promise<{ command: string; prefix: string[] }> {
  if (config.lark.cliPath) {
    return { command: config.lark.cliPath, prefix: [] };
  }
  const binary = bundledLarkBinary();
  await access(binary);
  return { command: binary, prefix: [] };
}

function larkEnv(config: AppConfig): NodeJS.ProcessEnv {
  const configDir = path.join(stateRoot(), "lark-cli");
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    LARKSUITE_CLI_CONFIG_DIR: configDir,
    LARKSUITE_CLI_LOG_DIR: path.join(configDir, "logs"),
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
    QUARKFANTOOLS_LARK_APP_SECRET: config.lark.appSecret
  };
}

export async function prepareLarkConfig(config: AppConfig): Promise<void> {
  const dir = path.join(stateRoot(), "lark-cli");
  await mkdir(dir, { recursive: true });
  if (!config.lark.appId) return;
  const markerPath = path.join(dir, ".quarkfantools-credential");
  const marker = createHash("sha256").update(`${config.lark.appId}:${config.lark.appSecret}`).digest("hex");
  if ((await readFile(markerPath, "utf8").catch(() => "")) === marker) return;
  const { command, prefix } = await resolveLarkCommand(config);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...profileArgs(config), "config", "init", "--app-id", config.lark.appId, "--app-secret-stdin", "--brand", "feishu"], {
      cwd: projectRoot(),
      env: larkEnv(config),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (output += String(chunk)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(output || `lark-cli config init exited ${code}`))));
    child.stdin?.end(`${config.lark.appSecret}\n`);
  });
  await writeFile(markerPath, marker, { encoding: "utf8", mode: 0o600 });
}

function profileArgs(config: AppConfig): string[] {
  return config.lark.profile ? ["--profile", config.lark.profile] : [];
}

export class LarkEventStream extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = "";
  private stopping: Promise<void> | null = null;

  async start(config: AppConfig): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.child) throw new Error("飞书事件监听已在运行");
    await prepareLarkConfig(config);
    const { command, prefix } = await resolveLarkCommand(config);
    const args = [
      ...prefix,
      ...profileArgs(config),
      "event",
      "+subscribe",
      "--as",
      config.lark.receiveIdentity,
      "--event-types",
      config.lark.eventTypes.join(","),
      "--quiet"
    ];
    const child = spawn(command, args, {
      cwd: projectRoot(),
      env: larkEnv(config),
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child = child;
    child.stdout?.on("data", (chunk) => this.consume(String(chunk)));
    child.stderr?.on("data", (chunk) => this.emit("stderr", String(chunk).trim()));
    child.on("exit", (code, signal) => {
      this.child = null;
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

export async function replyToMessage(config: AppConfig, messageId: string, text: string): Promise<void> {
  await prepareLarkConfig(config);
  const { command, prefix } = await resolveLarkCommand(config);
  const args = [
    ...prefix,
    ...profileArgs(config),
    "im",
    "+messages-reply",
    "--message-id",
    messageId,
    text.length > 100 ? "--markdown" : "--text",
    text,
    "--as",
    config.lark.replyIdentity,
    "--format",
    "json"
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot(), env: larkEnv(config) });
    let error = "";
    child.stderr.on("data", (chunk) => (error += String(chunk)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(error || `lark-cli exited ${code}`))));
  });
}

async function runLarkCapture(config: AppConfig, args: string[]): Promise<string> {
  const { command, prefix } = await resolveLarkCommand(config);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, [...prefix, ...profileArgs(config), ...args], {
      cwd: projectRoot(),
      env: larkEnv(config),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (output += String(chunk)));
    child.on("exit", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(output || `lark-cli auth login exited ${code}`))));
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

export async function loginLarkUser(config: AppConfig): Promise<string> {
  await prepareLarkConfig(config);
  const initiated = await runLarkCapture(config, ["auth", "login", "--recommend", "--no-wait", "--json"]);
  const result = JSON.parse(initiated) as unknown;
  const verificationUrl = findString(result, (key, value) => /url|uri/i.test(key) && /^https?:\/\//.test(value));
  const deviceCode = findString(result, (key) => /device.?code/i.test(key));
  if (!verificationUrl || !deviceCode) {
    throw new Error(`无法读取飞书 OAuth 授权链接或设备码: ${initiated}`);
  }
  await shell.openExternal(verificationUrl);
  return runLarkCapture(config, ["auth", "login", "--device-code", deviceCode, "--json"]);
}
