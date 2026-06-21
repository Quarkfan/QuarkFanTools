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
  roots: { stateRoot: string; workspaceRoot: string; skillRoots: string[] }
): SandboxFilesystem {
  const otherBotStateRoots = config.bots
    .filter((item) => item.id !== bot.id)
    .map((item) => path.join(roots.stateRoot, "bots", item.id));
  const otherBotWorkspaceRoots = config.bots
    .filter((item) => item.id !== bot.id)
    .map((item) => path.join(roots.workspaceRoot, "bots", item.id));
  return {
    denyRead: [...otherBotWorkspaceRoots, ...otherBotStateRoots, ...roots.skillRoots],
    denyWrite: [...otherBotWorkspaceRoots, ...otherBotStateRoots],
    allowRead: [workspace, botState],
    allowWrite: [workspace, botState]
  };
}
