import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { app } from "electron";
import { access, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { workspaceSessionId } from "./conversation.js";
import { skillsRoot, stateRoot, workspaceRoot } from "./paths.js";
import { larkRuntimeEnvironment } from "./lark-cli.js";
import { larkConnectorBot, larkConnectorEnabled, primaryProvider } from "./platform-connectors.js";
import type { AppConfig, BotConfig, ChatMessage, SkillSummary, SuiteSummary } from "./types.js";
import type { McpServerConfig as ClaudeMcpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { cacheWorkspaceFiles } from "./file-cache.js";
import { buildSandboxFilesystem } from "./sandbox-filesystem.js";
import { detectRawLarkDriveFileCommand } from "./lark-drive-guard.js";
import { syncBotRuntimeWorkspace } from "./bot-runtime-context.js";

async function syncSkillLinks(targetRoot: string, skills: SkillSummary[]): Promise<void> {
  await mkdir(targetRoot, { recursive: true });

  const expected = new Set(skills.map((skill) => skill.name));
  await Promise.all((await readdir(targetRoot).catch(() => []))
    .filter((entry) => !expected.has(entry))
    .map((entry) => rm(path.join(targetRoot, entry), { recursive: true, force: true })));
  await Promise.all(skills.map(async (skill) => {
    const target = path.join(targetRoot, skill.name);
    try {
      await access(target);
    } catch {
      await symlink(path.dirname(skill.path), target, "dir");
    }
  }));
}

async function ensureBotWorkspace(bot: BotConfig, conversationKey: string, skills: SkillSummary[]): Promise<{ claudeHome: string; workspace: string }> {
  const claudeHome = path.join(stateRoot(), "bots", bot.id, "claude-home");
  const workspace = path.join(workspaceRoot(), "bots", bot.id, "sessions", workspaceSessionId(conversationKey));
  await Promise.all([
    syncSkillLinks(path.join(claudeHome, "skills"), skills),
    syncSkillLinks(path.join(workspace, "skills"), skills)
  ]);
  await syncBotRuntimeWorkspace(bot, workspace);
  return { claudeHome, workspace };
}

function claudeExecutable(): string | undefined {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime", "claude", process.arch, "claude")
    : undefined;
}

export interface ClaudeRunResult {
  response: string;
  sessionId: string;
}

export type ClaudeProgress = { key: string; text: string };

export interface ClaudeSuiteContext {
  suite: SuiteSummary;
  authorizedSkills: string[];
  authorizedApps: string[];
  authorizedMcpServers: string[];
}

export async function runClaude(
  config: AppConfig,
  bot: BotConfig,
  message: ChatMessage,
  skills: SkillSummary[],
  conversationKey: string,
  resumeSessionId?: string,
  onProgress?: (progress: ClaudeProgress) => void,
  suiteContexts: ClaudeSuiteContext[] = []
): Promise<ClaudeRunResult> {
  const { claudeHome, workspace } = await ensureBotWorkspace(bot, conversationKey, skills);
  const botState = path.join(stateRoot(), "bots", bot.id);
  const provider = primaryProvider(bot);
  const larkBot = larkConnectorBot(bot);
  const skillList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  const allowedMcpRefs = (bot.capabilityRefs ?? []).filter((ref) => ref.enabled && ref.kind === "mcp" && ref.policy?.allowAgentUse !== false);
  const allowedMcpServers = config.mcpServers.filter((server) => server.enabled && server.transport === "stdio" && server.command.trim() && allowedMcpRefs.some((ref) => ref.id === server.id));
  const mcpList = allowedMcpServers.map((server) => `- ${server.name}: ${server.description || server.command}`).join("\n");
  const suiteList = suiteContexts.map(({ suite, authorizedSkills, authorizedApps, authorizedMcpServers }) => [
    `- ${suite.name}: ${suite.description || "未提供描述"}`,
    suite.instructions ? `  套件说明: ${suite.instructions}` : "",
    authorizedSkills.length ? `  已授权 Skills: ${authorizedSkills.join(", ")}` : "",
    authorizedApps.length ? `  已授权 Apps: ${authorizedApps.join(", ")}` : "",
    authorizedMcpServers.length ? `  已授权 MCP: ${authorizedMcpServers.join(", ")}` : "",
    suite.workflows.length ? `  工作流: ${suite.workflows.map((workflow) => `${workflow.name}(${workflow.prompt})`).join(" / ")}` : ""
  ].filter(Boolean).join("\n")).join("\n");
  const prompt = [
    `根据${providerLabel(provider)}消息选择最匹配的 Skill，并严格遵循该 Skill 的 SKILL.md。`,
    "你只能访问当前机器人的 skills 目录，不得尝试访问其他机器人或未授权 Skill。",
    "仅在用户明确要求时更新 Skill 和 knowledge 文件。",
    "当前 workspace 已生成 `CLAUDE.md`、`.quarkfan/cli-channels.json` 和 `./qft-cli`。需要调用平台 CLI 时优先使用 `./qft-cli <provider> ...`，不要直接调用原始 CLI 或修改凭据。",
    larkConnectorEnabled(bot)
      ? "当前 Bot 配置了飞书知识连接器。需要查找或读取飞书文档时必须使用用户态：先执行 `lark-cli skills read lark-doc`，再使用带 `--as user` 的 `lark-cli docs +fetch`、`lark-cli docs +search`、`lark-cli wiki` 或 `lark-cli drive`。"
      : "当前 Bot 未配置飞书知识连接器；不要假设可以访问飞书文档、Wiki、云盘或云 PPT。",
    larkConnectorEnabled(bot)
      ? "不得在 Agent 会话内执行 `lark-cli auth login`、`lark-cli config init` 或要求普通用户扫码授权；用户态 OAuth 只能由 QuarkfanTools 配置页完成。若用户态未授权或缺少 scope，提示管理员在应用配置页重新授权。"
      : "",
    larkConnectorEnabled(bot)
      ? "飞书云 PPT 是 slides 文档，不是普通文件；先用 `lark-cli drive +search --doc-types slides --as user` 查找。"
      : "",
    larkConnectorEnabled(bot)
      ? "需要下载飞书云盘文件或导出云文档继续分析时，不要直接裸调 `lark-cli drive +download` 或 `drive +export`。最终只输出一行 `LARK_CACHED_FILE: {\"action\":\"drive-export|drive-download\",\"fileToken\":\"...\",\"docType\":\"slides|doc|sheet|...\",\"fileExtension\":\"pptx|docx|xlsx|pdf\",\"fileName\":\"可选文件名\",\"freshnessKey\":\"可选更新时间或版本\",\"prompt\":\"文件准备好后继续分析的明确任务\"}`。drive-download 不需要 docType/fileExtension。不要同时输出其他内容。"
      : "",
    provider === "lark"
      ? "需要将生成的图片或文件回复给用户时，可执行 `lark-cli im +messages-reply --message-id <消息ID> --image <工作区相对路径> --as <回复身份>` 或对应的 --file。"
      : "最终回复由 QuarkfanTools 通过当前消息平台发送；不要假设可以直接调用当前平台 CLI 发送消息。",
    larkConnectorEnabled(bot)
      ? "如果在飞书中找到高度匹配但下载或深度解析耗时较长的文件，先给出已有的基本回答，然后最终只输出一行 `DEFERRED_DOWNLOAD: {\"summary\":\"给用户的基本回答与继续说明\",\"followUpPrompt\":\"用户确认后继续下载、预览并分析该文件的明确任务\"}`。不要同时输出其他内容。"
      : "",
    bot.ownerOpenId
      ? "如果确实无法解决，或执行操作前必须取得人工授权，最终只输出一行 `OWNER_ESCALATION: {\"type\":\"help|approval\",\"summary\":\"给 Owner 的清晰说明\"}`，不要同时输出普通回复。仅在必要时升级。"
      : "当前未配置 Owner；无法解决或需要人工授权时，直接向提问人说明。",
    `最终只输出应回复给${providerLabel(provider)}用户的内容，不要输出运行日志或内部推理。`,
    "",
    "可用 Skills：",
    skillList || "- 当前没有可用 Skill；明确告知用户。",
    "",
    "可用套件：",
    suiteList || "- 当前没有可用套件；不要假设存在行业预置上下文。",
    "",
    "可用 MCP：",
    mcpList || "- 当前没有可用 MCP；不要假设存在额外外部工具。",
    "",
    `当前消息 ID：${message.messageId}`,
    `当前消息平台：${providerLabel(provider)}`,
    `当前回复身份：${bot.replyIdentity}`,
    `当前模型多模态视觉能力：${config.model.multimodalEnabled ? "已启用" : "未启用"}`,
    message.resources.length > 0
      ? `已下载的消息资源：\n${message.resources.map((resource) => `- ${resource.type}: ${resource.localPath ?? resource.key}`).join("\n")}`
      : "当前消息没有附件。",
    "",
    `${providerLabel(provider)}消息：${message.text}`
  ].filter(Boolean).join("\n");

  const env = {
    ...process.env,
    ...(larkBot ? larkRuntimeEnvironment(larkBot) : {}),
    CLAUDE_CONFIG_DIR: claudeHome,
    CLAUDE_AGENT_SDK_CLIENT_APP: `quarkfantools/${app.getVersion()}`,
    ANTHROPIC_BASE_URL: config.model.baseUrl,
    ANTHROPIC_MODEL: config.model.model,
    ANTHROPIC_AUTH_TOKEN: config.model.apiKey,
    ANTHROPIC_API_KEY: config.model.apiKey
  };
  const mcpServers = Object.fromEntries(allowedMcpServers.map((server) => [server.id, toClaudeMcpServer(server)])) as Record<string, ClaudeMcpServerConfig>;
  const run = async (resume?: string): Promise<ClaudeRunResult> => {
    let result = "";
    let sessionId = "";
    for await (const item of query({
      prompt: buildPrompt(prompt, message, config.model.multimodalEnabled),
      options: {
        cwd: workspace,
        env,
        model: config.model.model,
        ...(resume ? { resume } : {}),
        ...(Object.keys(mcpServers).length > 0 ? { mcpServers, strictMcpConfig: true } : { strictMcpConfig: true }),
        pathToClaudeCodeExecutable: claudeExecutable(),
        settingSources: [],
        skills: "all",
        tools: ["Skill", "Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        allowedTools: ["Skill", "Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          enableWeakerNetworkIsolation: process.platform === "darwin",
          filesystem: buildSandboxFilesystem(config, bot, workspace, botState, skills, {
            stateRoot: stateRoot(),
            workspaceRoot: workspaceRoot(),
            skillsRoot: skillsRoot()
          })
        },
        maxTurns: Math.max(10, Math.min(100, config.runtime.maxAgentTurns ?? 60)),
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: "你是 QuarkfanTools 本地多 IM Skill Agent。"
        }
      }
    })) {
      sessionId = item.session_id || sessionId;
      const blockedCommand = detectRawLarkDriveFileCommand(item);
      if (blockedCommand) {
        throw new Error(`RAW_LARK_FILE_DOWNLOAD_BLOCKED: ${blockedCommand}`);
      }
      const progress = observableProgress(item);
      if (progress) onProgress?.(progress);
      if (item.type === "result") {
        if (item.subtype !== "success") throw new Error(item.errors.join("\n") || item.subtype);
        result = item.result;
      }
    }
    await cacheWorkspaceFiles(bot, workspace).catch(() => undefined);
    return {
      response: result.trim() || "处理完成，但没有生成可回复内容。",
      sessionId
    };
  };
  if (!resumeSessionId) return run();
  try {
    return await run(resumeSessionId);
  } catch (error) {
    if (!/session|resume|conversation.*not found|no conversation/i.test(String(error))) throw error;
    return run();
  }
}

export async function runVisionModel(config: AppConfig, promptText: string, imagePath: string): Promise<string> {
  if (!config.model.multimodalEnabled) throw new Error("模型多模态视觉能力未启用");
  if (!config.model.baseUrl || !config.model.model || !config.model.apiKey) throw new Error("模型 Base URL、模型名称或 API Key 未配置完整");
  const mediaType = imageMediaType(imagePath);
  if (!mediaType) throw new Error(`不支持的图片格式：${path.extname(imagePath)}`);
  const env = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: `quarkfantools/${app.getVersion()}`,
    ANTHROPIC_BASE_URL: config.model.baseUrl,
    ANTHROPIC_MODEL: config.model.model,
    ANTHROPIC_AUTH_TOKEN: config.model.apiKey,
    ANTHROPIC_API_KEY: config.model.apiKey
  };
  let result = "";
  for await (const item of query({
    prompt: visionPrompt(promptText, imagePath, mediaType),
    options: {
      cwd: path.dirname(imagePath),
      env,
      model: config.model.model,
      pathToClaudeCodeExecutable: claudeExecutable(),
      settingSources: [],
      tools: [],
      allowedTools: [],
      maxTurns: 1,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "你只做截图内容识别和结构化抽取，不执行任何工具或外部操作。"
      }
    }
  })) {
    if (item.type === "result") {
      if (item.subtype !== "success") throw new Error(item.errors.join("\n") || item.subtype);
      result = item.result;
    }
  }
  return result.trim() || "多模态模型没有返回可识别内容。";
}

function providerLabel(provider: string): string {
  if (provider === "wecom") return "企业微信";
  if (provider === "dingtalk") return "钉钉";
  return "飞书";
}

function toClaudeMcpServer(server: AppConfig["mcpServers"][number]): ClaudeMcpServerConfig {
  return {
    type: "stdio",
    command: server.command,
    args: server.args,
    env: Object.fromEntries(server.env.map((item) => [item.name, item.value])),
    ...(server.timeoutMs ? { timeout: server.timeoutMs } : {}),
    ...(server.alwaysLoad ? { alwaysLoad: true } : {})
  };
}

function observableProgress(item: unknown): ClaudeProgress | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  if (value.type === "assistant") {
    const message = value.message as { content?: Array<Record<string, unknown>> } | undefined;
    const tool = message?.content?.find((block) => block.type === "tool_use");
    if (!tool) return null;
    const name = String(tool.name ?? "工具");
    const labels: Record<string, string> = {
      Skill: "正在选择并读取 Skill",
      Read: "正在读取本地资料",
      Glob: "正在查找文件",
      Grep: "正在检索资料",
      Bash: "正在调用本地工具或飞书",
      Write: "正在整理文件",
      Edit: "正在更新文件"
    };
    return { key: `tool:${name}`, text: labels[name] ?? `正在使用 ${name}` };
  }
  if (value.type === "system" && value.subtype === "api_retry") {
    return { key: "api-retry", text: "模型服务暂时繁忙，正在重试" };
  }
  return null;
}

async function* buildPrompt(text: string, message: ChatMessage, multimodalEnabled: boolean): AsyncIterable<SDKUserMessage> {
  const content: SDKUserMessage["message"]["content"] = [{ type: "text", text }];
  if (!multimodalEnabled) {
    yield {
      type: "user",
      message: { role: "user", content },
      parent_tool_use_id: null
    };
    return;
  }
  for (const resource of message.resources) {
    if (resource.type !== "image" || !resource.localPath) continue;
    const mediaType = imageMediaType(resource.localPath);
    if (!mediaType) continue;
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: (await readFile(resource.localPath)).toString("base64")
      }
    });
  }
  yield {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null
  };
}

async function* visionPrompt(promptText: string, imagePath: string, mediaType: NonNullable<ReturnType<typeof imageMediaType>>): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "text", text: promptText },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: (await readFile(imagePath)).toString("base64")
          }
        }
      ]
    },
    parent_tool_use_id: null
  };
}

function imageMediaType(filePath: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    default: return null;
  }
}
