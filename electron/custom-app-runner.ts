import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runTextModel, runVisionModel } from "./claude.js";
import { workspaceSessionId } from "./conversation.js";
import { normalizeNodeArgs } from "./custom-app-entry.js";
import { normalizeCustomAppDeliveries, resolveReplyDeliveries } from "./custom-app-protocol.js";
import { workspaceRoot } from "./paths.js";
import type { AppConfig, BotConfig, CustomAppDeliveryRequest, CustomAppSummary, LarkMessage } from "./types.js";

export interface CustomAppRunResult {
  reply: string;
  deliveries: CustomAppDeliveryRequest[];
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
      workspace,
      deliveryRoutes: (bot.deliveryRoutes ?? [])
        .filter((route) => route.enabled)
        .map((route) => ({
          id: route.id,
          name: route.name ?? route.id,
          provider: route.provider,
          mode: route.mode
        }))
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
  payload: Record<string, unknown>,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<CustomAppRunResult> {
  let currentPayload = payload;
  let fallbackReply = "";
  let fallbackDeliveries: CustomAppDeliveryRequest[] = [];
  const maxPasses = 12;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const output = await runProcessOnce(customApp, cwd, currentPayload, command, args, env);
    if (!output) return { reply: `${customApp.name} 执行完成，但没有返回可回复内容。`, deliveries: [] };
    try {
      const parsed = JSON.parse(output) as {
        ok?: boolean;
        reply?: string;
        error?: string;
        visionRequest?: { imagePath?: string; prompt?: string };
        visionContinuation?: { input?: string; stage?: string; state?: unknown };
        deliveries?: unknown;
      };
      if (parsed.ok === false) throw new Error(parsed.error || `${customApp.name} 执行失败`);
      const reply = parsed.reply?.trim() || `${customApp.name} 执行完成，但没有返回可回复内容。`;
      const deliveries = normalizeCustomAppDeliveries(parsed.deliveries);
      fallbackReply = reply;
      fallbackDeliveries = deliveries;
      const vision = await maybeRunVisionRequest(config, cwd, parsed.visionRequest);
      if (parsed.visionContinuation && vision) {
        const context = typeof currentPayload.context === "object" && currentPayload.context
          ? currentPayload.context as Record<string, unknown>
          : {};
        currentPayload = {
          ...currentPayload,
          input: parsed.visionContinuation.input ?? currentPayload.input,
          context: {
            ...context,
            visionResult: vision,
            visionStage: parsed.visionContinuation.stage ?? "vision-continuation",
            visionState: parsed.visionContinuation.state
          }
        };
        continue;
      }
      const processedReply = await postProcessCustomAppReply(config, customApp, vision ? `${reply}\n\n多模态识别结果：\n${vision}` : reply);
      return { reply: processedReply, deliveries: resolveReplyDeliveries(deliveries, processedReply) };
    } catch {
      return { reply: await postProcessCustomAppReply(config, customApp, output), deliveries: [] };
    }
  }
  const reply = await postProcessCustomAppReply(config, customApp, fallbackReply || `${customApp.name} 执行完成，但多模态连续处理超过 ${maxPasses} 轮。`);
  return { reply, deliveries: resolveReplyDeliveries(fallbackDeliveries, reply) };
}

async function postProcessCustomAppReply(config: AppConfig, customApp: CustomAppSummary, reply: string): Promise<string> {
  const processing = config.runtime.customAppReplyProcessingByApp?.[customApp.id]
    ?? config.runtime.customAppReplyProcessing;
  if (!processing || processing.mode !== "summarize") return reply;
  const maxInputChars = Math.max(1000, Math.min(60000, processing.maxInputChars));
  const source = reply.length > maxInputChars ? `${reply.slice(0, maxInputChars)}\n\n[已按配置截断，原始长度 ${reply.length} 字符]` : reply;
  const prompt = [
    processing.prompt,
    "",
    `自定义应用：${customApp.name} (${customApp.id})`,
    "原始返回内容如下：",
    source
  ].join("\n");
  try {
    const summary = await runTextModel(config, prompt);
    return summary || reply;
  } catch (error) {
    return `${reply}\n\n返回内容总结失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

function runProcessOnce(
  customApp: CustomAppSummary,
  cwd: string,
  payload: unknown,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
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
