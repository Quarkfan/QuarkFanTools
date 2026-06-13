import { app } from "electron";
import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

export function projectRoot(): string {
  if (!app.isPackaged) {
    return process.cwd();
  }
  return process.resourcesPath;
}

export function skillsRoot(): string {
  return app.isPackaged
    ? path.join(app.getPath("userData"), "workspace", "skills")
    : path.join(projectRoot(), "skills");
}

export function builtinSkillsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "builtin-skills")
    : path.join(projectRoot(), "builtin-skills");
}

export function stateRoot(): string {
  const root = app.isPackaged
    ? path.join(app.getPath("userData"), "state")
    : path.join(projectRoot(), "state");
  return root;
}

export function workspaceRoot(): string {
  return app.isPackaged ? path.join(app.getPath("userData"), "workspace") : projectRoot();
}

export function defaultConfigPath(): string {
  return path.join(projectRoot(), "config", "default.json");
}

export function localConfigPath(): string {
  const devPath = path.join(projectRoot(), "config", "local.json");
  if (!app.isPackaged || existsSync(devPath)) {
    return devPath;
  }
  return path.join(app.getPath("userData"), "config", "local.json");
}

export async function migrateLegacyData(): Promise<void> {
  if (!app.isPackaged) return;
  const legacyRoot = path.join(app.getPath("appData"), "qah");
  const targetRoot = app.getPath("userData");
  for (const name of ["config", "workspace", "state"]) {
    const source = path.join(legacyRoot, name);
    const target = path.join(targetRoot, name);
    if (existsSync(source)) {
      await mkdir(targetRoot, { recursive: true });
      await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    }
  }
}
