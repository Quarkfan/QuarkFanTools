import path from "node:path";
import type { AppConfig, BotConfig, SkillSummary } from "./types.js";

export interface SandboxFilesystem {
  denyRead: string[];
  denyWrite: string[];
  allowRead: string[];
  allowWrite: string[];
}

export function buildSandboxFilesystem(
  config: AppConfig,
  bot: BotConfig,
  workspace: string,
  botState: string,
  skills: SkillSummary[],
  roots: { stateRoot: string; workspaceRoot: string; skillsRoot: string; larkCliSupportRoot?: string }
): SandboxFilesystem {
  const otherBotStateRoots = config.bots
    .filter((item) => item.id !== bot.id)
    .map((item) => path.join(roots.stateRoot, "bots", item.id));
  const otherBotWorkspaceRoots = config.bots
    .filter((item) => item.id !== bot.id)
    .map((item) => path.join(roots.workspaceRoot, "bots", item.id));
  const skillDirs = skills.map((skill) => path.dirname(skill.path));
  const sharedLarkCliRoots = roots.larkCliSupportRoot ? [roots.larkCliSupportRoot] : [];
  return {
    denyRead: [...otherBotWorkspaceRoots, ...otherBotStateRoots, roots.skillsRoot],
    denyWrite: [...otherBotWorkspaceRoots, ...otherBotStateRoots],
    allowRead: [workspace, botState, ...sharedLarkCliRoots, ...skillDirs],
    allowWrite: [workspace, botState, ...sharedLarkCliRoots, ...skillDirs]
  };
}
