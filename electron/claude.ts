import { query } from "@anthropic-ai/claude-agent-sdk";
import { app } from "electron";
import { access, mkdir, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { skillsRoot, stateRoot, workspaceRoot } from "./paths.js";
import { larkRuntimeEnvironment } from "./lark-cli.js";
import type { AppConfig, BotConfig, LarkMessage, SkillSummary } from "./types.js";

async function syncSkillLinks(targetRoot: string, skills: SkillSummary[]): Promise<void> {
  await mkdir(targetRoot, { recursive: true });

  const expected = new Set(skills.map((skill) => skill.name));
  for (const entry of await readdir(targetRoot).catch(() => [])) {
    if (!expected.has(entry)) await rm(path.join(targetRoot, entry), { recursive: true, force: true });
  }
  for (const skill of skills) {
    const target = path.join(targetRoot, skill.name);
    try {
      await access(target);
    } catch {
      await symlink(path.dirname(skill.path), target, "dir");
    }
  }
}

async function ensureBotWorkspace(bot: BotConfig, skills: SkillSummary[]): Promise<{ claudeHome: string; workspace: string }> {
  const claudeHome = path.join(stateRoot(), "bots", bot.id, "claude-home");
  const workspace = path.join(workspaceRoot(), "bots", bot.id);
  await syncSkillLinks(path.join(claudeHome, "skills"), skills);
  await syncSkillLinks(path.join(workspace, "skills"), skills);
  return { claudeHome, workspace };
}

function claudeExecutable(): string | undefined {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime", "claude", process.arch, "claude")
    : undefined;
}

export async function runClaude(config: AppConfig, bot: BotConfig, message: LarkMessage, skills: SkillSummary[]): Promise<string> {
  const { claudeHome, workspace } = await ensureBotWorkspace(bot, skills);
  const botState = path.join(stateRoot(), "bots", bot.id);
  const skillList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  const prompt = [
    "根据飞书消息选择最匹配的 Skill，并严格遵循该 Skill 的 SKILL.md。",
    "你只能访问当前机器人的 skills 目录，不得尝试访问其他机器人或未授权 Skill。",
    "仅在用户明确要求时更新 Skill 和 knowledge 文件。",
    "最终只输出应回复给飞书用户的内容，不要输出运行日志或内部推理。",
    "",
    "可用 Skills：",
    skillList || "- 当前没有可用 Skill；明确告知用户。",
    "",
    `飞书消息：${message.text}`
  ].join("\n");

  const env = {
    ...process.env,
    ...larkRuntimeEnvironment(bot),
    CLAUDE_CONFIG_DIR: claudeHome,
    CLAUDE_AGENT_SDK_CLIENT_APP: "quarkfantools/1.0.0",
    ANTHROPIC_BASE_URL: config.model.baseUrl,
    ANTHROPIC_MODEL: config.model.model,
    ANTHROPIC_AUTH_TOKEN: config.model.apiKey,
    ANTHROPIC_API_KEY: config.model.apiKey
  };
  let result = "";
  for await (const item of query({
    prompt,
    options: {
      cwd: workspace,
      env,
      model: config.model.model,
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
    if (item.type === "result") {
      if (item.subtype !== "success") throw new Error(item.errors.join("\n") || item.subtype);
      result = item.result;
    }
  }
  return result.trim() || "处理完成，但没有生成可回复内容。";
}
