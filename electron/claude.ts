import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { app } from "electron";
import { access, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { workspaceSessionId } from "./conversation.js";
import { skillsRoot, stateRoot, workspaceRoot } from "./paths.js";
import { larkRuntimeEnvironment } from "./lark-cli.js";
import type { AppConfig, BotConfig, LarkMessage, SkillSummary } from "./types.js";

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

export async function runClaude(
  config: AppConfig,
  bot: BotConfig,
  message: LarkMessage,
  skills: SkillSummary[],
  conversationKey: string,
  resumeSessionId?: string
): Promise<ClaudeRunResult> {
  const { claudeHome, workspace } = await ensureBotWorkspace(bot, conversationKey, skills);
  const botState = path.join(stateRoot(), "bots", bot.id);
  const skillList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  const prompt = [
    "根据飞书消息选择最匹配的 Skill，并严格遵循该 Skill 的 SKILL.md。",
    "你只能访问当前机器人的 skills 目录，不得尝试访问其他机器人或未授权 Skill。",
    "仅在用户明确要求时更新 Skill 和 knowledge 文件。",
    "你可以默认通过 Bash 调用 lark-cli，命令会自动使用当前机器人隔离的飞书身份与凭据。",
    "需要读取飞书文档时，先执行 `lark-cli skills read lark-doc`，再使用 `lark-cli docs +fetch`、`lark-cli docs +search`、`lark-cli wiki` 或 `lark-cli drive`。",
    "需要将生成的图片或文件回复给用户时，可执行 `lark-cli im +messages-reply --message-id <消息ID> --image <工作区相对路径> --as <回复身份>` 或对应的 --file。",
    bot.ownerOpenId
      ? "如果确实无法解决，或执行操作前必须取得人工授权，最终只输出一行 `OWNER_ESCALATION: {\"type\":\"help|approval\",\"summary\":\"给 Owner 的清晰说明\"}`，不要同时输出普通回复。仅在必要时升级。"
      : "当前未配置 Owner；无法解决或需要人工授权时，直接向提问人说明。",
    "最终只输出应回复给飞书用户的内容，不要输出运行日志或内部推理。",
    "",
    "可用 Skills：",
    skillList || "- 当前没有可用 Skill；明确告知用户。",
    "",
    `当前消息 ID：${message.messageId}`,
    `当前飞书回复身份：${bot.replyIdentity}`,
    `当前模型多模态视觉能力：${config.model.multimodalEnabled ? "已启用" : "未启用"}`,
    message.resources.length > 0
      ? `已下载的消息资源：\n${message.resources.map((resource) => `- ${resource.type}: ${resource.localPath ?? resource.key}`).join("\n")}`
      : "当前消息没有附件。",
    "",
    `飞书消息：${message.text}`
  ].join("\n");

  const env = {
    ...process.env,
    ...larkRuntimeEnvironment(bot),
    CLAUDE_CONFIG_DIR: claudeHome,
    CLAUDE_AGENT_SDK_CLIENT_APP: `quarkfantools/${app.getVersion()}`,
    ANTHROPIC_BASE_URL: config.model.baseUrl,
    ANTHROPIC_MODEL: config.model.model,
    ANTHROPIC_AUTH_TOKEN: config.model.apiKey,
    ANTHROPIC_API_KEY: config.model.apiKey
  };
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
          filesystem: {
            denyRead: [path.join(workspaceRoot(), "bots"), path.join(stateRoot(), "bots"), skillsRoot()],
            denyWrite: [path.join(workspaceRoot(), "bots"), path.join(stateRoot(), "bots"), skillsRoot()],
            allowRead: [workspace, botState, ...skills.map((skill) => path.dirname(skill.path))],
            allowWrite: [workspace, botState, ...skills.map((skill) => path.dirname(skill.path))]
          }
        },
        maxTurns: 20,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: "你是 QuarkfanTools 本地飞书 Skill Agent。"
        }
      }
    })) {
      sessionId = item.session_id || sessionId;
      if (item.type === "result") {
        if (item.subtype !== "success") throw new Error(item.errors.join("\n") || item.subtype);
        result = item.result;
      }
    }
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

async function* buildPrompt(text: string, message: LarkMessage, multimodalEnabled: boolean): AsyncIterable<SDKUserMessage> {
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
