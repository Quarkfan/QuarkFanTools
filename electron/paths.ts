import electron from "electron";
import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
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

export function builtinAppsRoot(): string {
  return isPackaged()
    ? path.join(process.resourcesPath, "builtin-apps")
    : path.join(projectRoot(), "builtin-apps");
}

export function suitesRoot(): string {
  return isPackaged()
    ? path.join(appPath("userData"), "workspace", "suites")
    : path.join(projectRoot(), "suites");
}

export function builtinSuitesRoot(): string {
  return isPackaged()
    ? path.join(process.resourcesPath, "builtin-suites")
    : path.join(projectRoot(), "builtin-suites");
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

export function botLarkHomeRoot(botId: string): string {
  return path.join(botStateRoot(botId), "lark-home");
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

export async function backupLegacyDataBeforeMigration(legacyRoot: string, targetRoot: string, timestamp = backupTimestamp()): Promise<string | null> {
  if (!existsSync(legacyRoot)) return null;
  const backupRoot = path.join(targetRoot, "backups", `legacy-qah-${timestamp}`);
  await mkdir(path.dirname(backupRoot), { recursive: true });
  await cp(legacyRoot, backupRoot, { recursive: true, force: false, errorOnExist: true });
  await writeFile(path.join(backupRoot, "BACKUP-README.txt"), [
    "QuarkfanTools legacy qah data backup.",
    "This backup was created before migrating config/workspace/state into the current app data directory.",
    "It is safe to keep for rollback or manual recovery if an old-version data shape cannot be fully adapted.",
    ""
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
  return backupRoot;
}

export async function migrateLegacyData(): Promise<void> {
  if (!isPackaged()) return;
  const legacyRoot = path.join(appPath("appData"), "qah");
  const targetRoot = appPath("userData");
  const marker = path.join(targetRoot, ".legacy-qah-migrated");
  if (!existsSync(legacyRoot) || existsSync(marker)) return;
  await backupLegacyDataBeforeMigration(legacyRoot, targetRoot);
  for (const name of ["config", "workspace", "state"]) {
    const source = path.join(legacyRoot, name);
    const target = path.join(targetRoot, name);
    if (existsSync(source)) {
      await mkdir(targetRoot, { recursive: true });
      await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    }
  }
  await writeFile(marker, `${new Date().toISOString()}\n`, { encoding: "utf8", mode: 0o600 });
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
