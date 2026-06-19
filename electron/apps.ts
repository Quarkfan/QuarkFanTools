import { access, cp, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { appsRoot } from "./paths.js";
import type { CustomAppPreview, CustomAppSummary } from "./types.js";

type RawManifest = Record<string, unknown>;

export async function discoverCustomApps(): Promise<CustomAppSummary[]> {
  const root = appsRoot();
  await mkdir(root, { recursive: true });
  const apps: CustomAppSummary[] = [];
  const seen = new Set<string>();
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const appDir = path.join(root, entry.name);
    try {
      const app = await readCustomApp(appDir);
      if (seen.has(app.id)) continue;
      seen.add(app.id);
      apps.push(app);
    } catch {
      // Ignore incomplete app directories; import and preview surface validation errors.
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function importCustomAppFolder(source: string): Promise<string> {
  const app = await readCustomApp(source);
  const root = appsRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, app.id);
  if (path.resolve(source) === path.resolve(target)) return target;
  try {
    await access(target);
    throw new Error(`自定义应用 ${app.id} 已存在，请先删除或更换 app.json id`);
  } catch (error) {
    if (String(error).includes("已存在")) throw error;
  }
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  await readCustomApp(target);
  return target;
}

export async function customAppPreview(id: string): Promise<CustomAppPreview> {
  const app = (await discoverCustomApps()).find((item) => item.id === id);
  if (!app) throw new Error("自定义应用不存在");
  return {
    app,
    manifest: await readFile(path.join(app.path, "app.json"), "utf8"),
    files: await listFiles(app.path, app.path)
  };
}

async function readCustomApp(appDir: string): Promise<CustomAppSummary> {
  const manifestText = await readFile(path.join(appDir, "app.json"), "utf8");
  const manifest = JSON.parse(manifestText) as RawManifest;
  const id = cleanId(requiredString(manifest, "id"));
  if (!id) throw new Error("app.json id 只能包含小写字母、数字、短横线、下划线和点");
  const name = requiredString(manifest, "name");
  const description = stringValue(manifest.description);
  const version = stringValue(manifest.version) || "0.0.0";
  const entryRaw = objectValue(manifest.entry);
  const entryType = stringValue(entryRaw.type) || "node";
  if (!["node", "executable", "webview", "mcp-adapter", "workflow"].includes(entryType)) {
    throw new Error(`不支持的自定义应用 entry.type: ${entryType}`);
  }
  const command = stringValue(entryRaw.command);
  const args = arrayStrings(entryRaw.args);
  if (["node", "executable"].includes(entryType) && !command) {
    throw new Error("node 或 executable 自定义应用必须声明 entry.command");
  }
  const capabilitiesRaw = objectValue(manifest.capabilities);
  const permissionsRaw = objectValue(manifest.permissions);
  return {
    id,
    name,
    description,
    version,
    path: appDir,
    source: "local",
    entry: {
      type: entryType as CustomAppSummary["entry"]["type"],
      command,
      args
    },
    capabilities: {
      agentCallable: booleanValue(capabilitiesRaw.agentCallable),
      commandCallable: booleanValue(capabilitiesRaw.commandCallable),
      scheduledCallable: booleanValue(capabilitiesRaw.scheduledCallable),
      hasUi: booleanValue(capabilitiesRaw.hasUi)
    },
    permissions: {
      network: booleanValue(permissionsRaw.network),
      filesystem: arrayStrings(permissionsRaw.filesystem),
      requiresOwnerApproval: booleanValue(permissionsRaw.requiresOwnerApproval)
    }
  };
}

function requiredString(manifest: RawManifest, key: string): string {
  const value = stringValue(manifest[key]);
  if (!value) throw new Error(`app.json 缺少 ${key}`);
  return value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): RawManifest {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawManifest : {};
}

function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function cleanId(value: string): string {
  return /^[a-z0-9._-]+$/.test(value) ? value : "";
}

async function listFiles(root: string, current: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === ".git") continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, target));
    else result.push(path.relative(root, target));
    if (result.length >= 200) break;
  }
  return result;
}
