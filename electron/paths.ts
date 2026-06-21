import electron from "electron";
import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const electronApp = typeof electron === "object" && electron && "app" in electron ? electron.app : null;

function isPackaged(): boolean {
  return electronApp?.isPackaged ?? process.env.QFT_IS_PACKAGED === "1";
}

function resourcesPath(): string {
  return process.env.QFT_RESOURCES_PATH ?? process.resourcesPath ?? process.cwd();
}

function appPath(name: "userData" | "appData"): string {
  const envName = name === "userData" ? "QFT_USER_DATA_PATH" : "QFT_APP_DATA_PATH";
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  return electronApp?.getPath(name) ?? projectRoot();
}

export function projectRoot(): string {
  if (!isPackaged()) {
    return process.cwd();
  }
  return resourcesPath();
}

export function skillsRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "skills")
    : path.join(projectRoot(), "skills");
}

export function builtinSkillsRoot(): string {
  return isPackaged()
    ? path.join(resourcesPath(), "builtin-skills")
    : path.join(projectRoot(), "builtin-skills");
}

export function marketSkillsRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "market-skills")
    : path.join(projectRoot(), "market-skills");
}

export function stateRoot(): string {
  const root = isPackaged()
    ? path.join(appPath("userData"), "state")
    : path.join(projectRoot(), "state");
  return root;
}

export function workspaceRoot(): string {
  return isPackaged() ? path.join(appPath("userData"), "workspace") : projectRoot();
}

export function botLarkHomeRoot(botId: string): string {
  return path.join(stateRoot(), "bots", botId, "lark-home");
}

export function botLarkCliSupportRoot(botId: string): string {
  return path.join(botLarkHomeRoot(botId), "Library", "Application Support", "lark-cli");
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
