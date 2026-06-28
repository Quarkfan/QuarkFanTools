import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runVisionModel } from "./claude.js";
import { workspaceSessionId } from "./conversation.js";
import { normalizeNodeArgs } from "./custom-app-entry.js";
import { workspaceRoot } from "./paths.js";
import type { AppConfig, BotConfig, CustomAppSummary, LarkMessage } from "./types.js";

export interface CustomAppRunResult {
  reply: string;
}

export async function runCustomApp(
  config: AppConfig,
  bot: BotConfig,
  customApp: CustomAppSummary,
  message: LarkMessage,
  conversationKey: string,
  input: string,
  trigger: "command" | "agent" | "scheduled"
): Promise<CustomAppRunResult> {
  const workspace = path.join(workspaceRoot(), "bots", bot.id, "sessions", workspaceSessionId(conversationKey), "apps", customApp.id);
  await mkdir(workspace, { recursive: true });
  const payload = {
    botId: bot.id,
    trigger,
    input,
    context: {
      messageId: message.messageId,
      chatId: message.chatId,
      workspace
    }
  };

  if (customApp.entry.type === "node") {
    const args = normalizeNodeArgs(customApp);
    return runProcess(config, customApp, workspace, payload, process.execPath, args, {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    });
  }

  if (customApp.entry.type === "executable") {
    const [firstArg, ...restArgs] = customApp.entry.args ?? [];
    const command = customApp.entry.command ? path.resolve(customApp.path, customApp.entry.command) : path.resolve(customApp.path, firstArg ?? "");
    const args = customApp.entry.command ? (customApp.entry.args ?? []) : restArgs;
    return runProcess(config, customApp, workspace, payload, command, args, process.env);
  }

  throw new Error(`当前尚不支持直接执行 ${customApp.entry.type} 类型的自定义应用`);
}

async function runProcess(
  config: AppConfig,
  customApp: CustomAppSummary,
  cwd: string,
  payload: unknown,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<CustomAppRunResult> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error([stderr.trim(), stdout.trim()].filter(Boolean).join("\n") || `${customApp.name} exited ${code}`));
    });
    child.stdin?.end(`${JSON.stringify(payload)}\n`);
  });

  if (!output) return { reply: `${customApp.name} 执行完成，但没有返回可回复内容。` };
  try {
    const parsed = JSON.parse(output) as { ok?: boolean; reply?: string; error?: string; visionRequest?: { imagePath?: string; prompt?: string } };
    if (parsed.ok === false) throw new Error(parsed.error || `${customApp.name} 执行失败`);
    const reply = parsed.reply?.trim() || `${customApp.name} 执行完成，但没有返回可回复内容。`;
    const vision = await maybeRunVisionRequest(config, cwd, parsed.visionRequest);
    return { reply: vision ? `${reply}\n\n多模态识别结果：\n${vision}` : reply };
  } catch {
    return { reply: output };
  }
}

async function maybeRunVisionRequest(
  config: AppConfig,
  workspace: string,
  request: { imagePath?: string; prompt?: string } | undefined
): Promise<string> {
  if (!request?.imagePath || !request.prompt) return "";
  const imagePath = path.resolve(workspace, request.imagePath);
  const relative = path.relative(workspace, imagePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return "已拒绝多模态识别：图片路径不在当前自定义应用 workspace 内。";
  }
  try {
    return await runVisionModel(config, request.prompt, imagePath);
  } catch (error) {
    return `多模态识别失败：${error instanceof Error ? error.message : String(error)}`;
  }
}
