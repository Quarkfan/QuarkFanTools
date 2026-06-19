import electron from "electron";
import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const { app } = electron;

function isPackaged(): boolean {
  return Boolean(app?.isPackaged);
}

function appPath(name: Parameters<NonNullable<typeof app>["getPath"]>[0]): string {
  return app?.getPath(name) ?? process.cwd();
}

export function projectRoot(): string {
  if (!isPackaged()) {
    return process.cwd();
  }
  return process.resourcesPath;
}

export function skillsRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "skills")
    : path.join(projectRoot(), "skills");
}

export function builtinSkillsRoot(): string {
  return isPackaged()
    ? path.join(process.resourcesPath, "builtin-skills")
    : path.join(projectRoot(), "builtin-skills");
}

export function marketSkillsRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "market-skills")
    : path.join(projectRoot(), "market-skills");
}

export function appsRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "apps")
    : path.join(projectRoot(), "apps");
}

export function suitesRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "suites")
    : path.join(projectRoot(), "suites");
}

export function stateRoot(): string {
  const root = isPackaged()
    ? path.join(appPath("userData"), "state")
    : path.join(projectRoot(), "state");
  return root;
}

export function botStateRoot(botIdOrBot: string | { id: string }): string {
  const botId = typeof botIdOrBot === "string" ? botIdOrBot : botIdOrBot.id;
  return path.join(stateRoot(), "bots", botId);
}

export function workspaceRoot(): string {
  return isPackaged() ? path.join(appPath("userData"), "workspace") : projectRoot();
}

export function larkCliSupportRoot(): string {
  return path.join(appPath("appData"), "lark-cli");
}

export function defaultConfigPath(): string {
  return path.join(projectRoot(), "config", "default.json");
}

export function localConfigPath(): string {
  const devPath = path.join(projectRoot(), "config", "local.json");
  if (!isPackaged() || existsSync(devPath)) {
    return devPath;
  }
  return path.join(appPath("userData"), "config", "local.json");
}

export async function migrateLegacyData(): Promise<void> {
  if (!isPackaged()) return;
  const legacyRoot = path.join(appPath("appData"), "qah");
  const targetRoot = appPath("userData");
  for (const name of ["config", "workspace", "state"]) {
    const source = path.join(legacyRoot, name);
    const target = path.join(targetRoot, name);
    if (existsSync(source)) {
      await mkdir(targetRoot, { recursive: true });
      await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    }
  }
}
