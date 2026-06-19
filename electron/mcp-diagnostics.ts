import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { AppConfig, McpServerConfig, McpServerDiagnostic } from "./types.js";

export interface McpDiagnosticsOptions {
  probeProtocol?: boolean;
}

export async function mcpServerDiagnostics(config: AppConfig, options: McpDiagnosticsOptions = {}): Promise<McpServerDiagnostic[]> {
  return Promise.all(config.mcpServers.map((server) => diagnoseMcpServer(config, server, options)));
}

async function diagnoseMcpServer(config: AppConfig, server: McpServerConfig, options: McpDiagnosticsOptions): Promise<McpServerDiagnostic> {
  const issues: string[] = [];
  if (!server.enabled) issues.push("MCP 服务已停用");
  if (server.transport !== "stdio") issues.push(`不支持的传输类型: ${server.transport}`);
  if (!server.command.trim()) issues.push("未配置启动命令");

  const commandResolved = server.command.trim()
    ? await resolveCommand(server.command, server.cwd, process.env.PATH ?? "")
    : undefined;
  if (server.command.trim() && !commandResolved) issues.push("启动命令无法在 cwd 或 PATH 中解析");

  if (server.cwd) {
    try {
      await access(server.cwd, constants.R_OK);
    } catch {
      issues.push("cwd 不存在或不可读");
    }
  }

  const emptyEnv = server.env.filter((item) => item.name && !item.value).map((item) => item.name);
  if (emptyEnv.length > 0) issues.push(`环境变量未填写: ${emptyEnv.join(", ")}`);

  const authorizedBotNames = config.bots
    .filter((bot) => bot.capabilityRefs?.some((ref) => ref.enabled && ref.kind === "mcp" && ref.id === server.id))
    .map((bot) => bot.name || bot.id);
  if (server.enabled && authorizedBotNames.length === 0) issues.push("尚未授权给任何 Bot");

  const status: McpServerDiagnostic["status"] = issues.some((issue) => /无法|不存在|不可读|未配置|不支持/.test(issue))
    ? "error"
    : issues.length > 0 ? "warn" : "ok";
  const diagnostic: McpServerDiagnostic = {
    id: server.id,
    name: server.name,
    status,
    commandResolved,
    authorizedBotNames,
    issues,
    protocol: { status: "not-run", tools: [] }
  };
  if (options.probeProtocol && status !== "error" && server.enabled && server.transport === "stdio" && commandResolved) {
    const protocol = await probeMcpServer(server, commandResolved);
    diagnostic.protocol = protocol;
    if (protocol.status === "failed") {
      diagnostic.issues.push(`协议探测失败: ${protocol.error ?? "未知错误"}`);
      diagnostic.status = "error";
    }
  }
  return diagnostic;
}

async function probeMcpServer(server: McpServerConfig, command: string): Promise<NonNullable<McpServerDiagnostic["protocol"]>> {
  const startedAt = Date.now();
  const timeoutMs = Math.min(Math.max(server.timeoutMs ?? 3000, 1000), 15000);
  let child: ChildProcessWithoutNullStreams | undefined;
  let client: McpProbeClient | undefined;
  try {
    child = spawn(command, server.args, {
      cwd: server.cwd || process.cwd(),
      env: {
        ...process.env,
        ...Object.fromEntries(server.env.filter((item) => item.name).map((item) => [item.name, item.value]))
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    client = new McpProbeClient(child, timeoutMs);
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "QuarkfanTools", version: "2.0-diagnostics" }
    });
    client.notify("notifications/initialized", {});
    const toolsResult = await client.request("tools/list", {});
    const tools = toolNames(toolsResult).slice(0, 20);
    return { status: "ok", durationMs: Date.now() - startedAt, tools };
  } catch (error) {
    const failure = client?.failureContext();
    return {
      status: "failed",
      durationMs: Date.now() - startedAt,
      tools: [],
      error: trimError(error),
      stderrTail: failure?.stderrTail,
      exitCode: failure?.exitCode,
      signal: failure?.signal
    };
  } finally {
    if (child && !child.killed) child.kill();
  }
}

class McpProbeClient {
  private nextId = 1;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private stderr = "";
  private exitCode: number | null | undefined;
  private signal: string | null | undefined;

  constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly timeoutMs: number) {
    child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-1000);
    });
    child.on("error", (error) => this.rejectAll(error));
    child.on("exit", (code, signal) => {
      this.exitCode = code;
      this.signal = signal;
      if (this.pending.size > 0) this.rejectAll(new Error(`MCP 进程已退出 code=${code ?? ""} signal=${signal ?? ""}${this.stderr ? ` stderr=${this.stderr}` : ""}`));
    });
  }

  failureContext(): { stderrTail?: string; exitCode?: number | null; signal?: string | null } {
    return {
      stderrTail: this.stderr.trim() || undefined,
      exitCode: this.exitCode,
      signal: this.signal
    };
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时: ${method}${this.stderr ? ` stderr=${this.stderr}` : ""}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(frameJson(payload));
    });
  }

  notify(method: string, params: unknown): void {
    this.child.stdin.write(frameJson({ jsonrpc: "2.0", method, params }));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      while (true) {
        const parsed = readFrame(this.buffer);
        if (!parsed) return;
        this.buffer = parsed.rest;
        this.onMessage(parsed.message);
      }
    } catch (error) {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private onMessage(message: unknown): void {
    const value = message as { id?: unknown; result?: unknown; error?: { message?: string } };
    if (typeof value.id !== "number") return;
    const pending = this.pending.get(value.id);
    if (!pending) return;
    this.pending.delete(value.id);
    clearTimeout(pending.timer);
    if (value.error) pending.reject(new Error(value.error.message || "MCP 返回错误"));
    else pending.resolve(value.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

function frameJson(value: unknown): string {
  const body = JSON.stringify(value);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function readFrame(buffer: Buffer<ArrayBufferLike>): { message: unknown; rest: Buffer<ArrayBufferLike> } | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header);
  if (!lengthMatch) throw new Error("MCP 响应缺少 Content-Length");
  const contentLength = Number(lengthMatch[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + contentLength;
  if (buffer.length < bodyEnd) return null;
  const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
  return { message: JSON.parse(body), rest: buffer.subarray(bodyEnd) };
}

function toolNames(result: unknown): string[] {
  const tools = (result as { tools?: Array<{ name?: unknown }> })?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => typeof tool.name === "string" ? tool.name : "").filter(Boolean);
}

function trimError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function resolveCommand(command: string, cwd: string | undefined, pathValue: string): Promise<string | undefined> {
  const candidates = command.includes(path.sep) || command.startsWith(".")
    ? [path.resolve(cwd || process.cwd(), command)]
    : pathValue.split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep scanning PATH candidates.
    }
  }
  return undefined;
}
