import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { appsRoot, builtinAppsRoot } from "./paths.js";
import type { CustomAppDiagnostic, CustomAppPreview, CustomAppSummary } from "./types.js";

type RawManifest = Record<string, unknown>;

export async function discoverCustomApps(): Promise<CustomAppSummary[]> {
  const apps: CustomAppSummary[] = [];
  const seen = new Set<string>();
  await appendDiscoveredCustomApps(apps, seen, builtinAppsRoot(), "builtin", false);
  await mkdir(appsRoot(), { recursive: true });
  await appendDiscoveredCustomApps(apps, seen, appsRoot(), "local", true);
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

async function appendDiscoveredCustomApps(apps: CustomAppSummary[], seen: Set<string>, root: string, source: CustomAppSummary["source"], requireDirectory = true): Promise<void> {
  if (requireDirectory) await mkdir(root, { recursive: true });
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const appDir = path.join(root, entry.name);
    try {
      const app = await readCustomApp(appDir, source);
      if (seen.has(app.id)) continue;
      seen.add(app.id);
      apps.push(app);
    } catch {
      // Ignore incomplete app directories; import and preview surface validation errors.
    }
  }
}

export async function importCustomAppFolder(source: string): Promise<string> {
  const app = await readCustomApp(source, "local");
  const blocking = (app.diagnostics ?? []).filter((item) => item.status === "error");
  if (blocking.length > 0) throw new Error(`自定义应用 ${app.id} 未通过校验：${blocking.map((item) => item.message).join("；")}`);
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
  await writeLifecycle(target, "installed");
  await readCustomApp(target, "local");
  return target;
}

export async function upgradeCustomAppFolder(source: string): Promise<string> {
  const app = await readCustomApp(source, "local");
  const blocking = (app.diagnostics ?? []).filter((item) => item.status === "error");
  if (blocking.length > 0) throw new Error(`自定义应用 ${app.id} 未通过校验：${blocking.map((item) => item.message).join("；")}`);
  const root = appsRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, app.id);
  await access(target).catch(() => {
    throw new Error(`自定义应用 ${app.id} 尚未安装，不能升级`);
  });
  const previousLifecycle = await readLifecycle(target);
  if (path.resolve(source) !== path.resolve(target)) {
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  }
  await writeLifecycle(target, "upgraded", previousLifecycle.installedAt);
  await readCustomApp(target, "local");
  return target;
}

export async function removeCustomAppFolder(id: string): Promise<boolean> {
  if (!cleanId(id)) return false;
  const target = path.join(appsRoot(), id);
  await rm(target, { recursive: true, force: true });
  return true;
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

export async function saveCustomAppManifest(id: string, manifestText: string): Promise<string> {
  if (!cleanId(id)) throw new Error("自定义应用 ID 不合法");
  const app = (await discoverCustomApps()).find((item) => item.id === id);
  if (!app) throw new Error("自定义应用不存在");
  if (app.source !== "local") throw new Error("内置自定义应用模板不能直接编辑，请先复制为本地副本。");
  const manifestPath = path.join(app.path, "app.json");
  const previous = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, ensureTrailingNewline(manifestText), { encoding: "utf8", mode: 0o600 });
  try {
    const updated = await readCustomApp(app.path, "local");
    const blocking = (updated.diagnostics ?? []).filter((item) => item.status === "error");
    if (blocking.length > 0) throw new Error(blocking.map((item) => item.message).join("；"));
    if (updated.id !== id) throw new Error("编辑现有自定义应用时不能修改 app.json id；如需新 ID，请复制模板或重新导入。");
  } catch (error) {
    await writeFile(manifestPath, previous, { encoding: "utf8", mode: 0o600 });
    throw error;
  }
  await writeLifecycle(app.path, "upgraded", app.lifecycle?.installedAt);
  return manifestPath;
}

export async function copyCustomAppTemplate(id: string, newId: string): Promise<string> {
  const source = (await discoverCustomApps()).find((item) => item.id === id);
  if (!source) throw new Error("自定义应用模板不存在");
  const cleanNewId = cleanId(newId);
  if (!cleanNewId) throw new Error("新自定义应用 ID 只能包含小写字母、数字、短横线、下划线和点");
  const target = path.join(appsRoot(), cleanNewId);
  await access(target).then(() => {
    throw new Error(`自定义应用 ${cleanNewId} 已存在`);
  }).catch((error) => {
    if (String(error).includes("已存在")) throw error;
  });
  await mkdir(appsRoot(), { recursive: true });
  await cp(source.path, target, { recursive: true, force: false, errorOnExist: true });
  const manifestPath = path.join(target, "app.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RawManifest;
  manifest.id = cleanNewId;
  manifest.name = `${stringValue(manifest.name) || source.name} 副本`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await writeLifecycle(target, "installed");
  await readCustomApp(target, "local");
  return target;
}

async function readCustomApp(appDir: string, source: CustomAppSummary["source"]): Promise<CustomAppSummary> {
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
  const entry = {
    type: entryType as CustomAppSummary["entry"]["type"],
    command,
    args
  };
  const capabilities = {
    agentCallable: booleanValue(capabilitiesRaw.agentCallable),
    commandCallable: booleanValue(capabilitiesRaw.commandCallable),
    scheduledCallable: booleanValue(capabilitiesRaw.scheduledCallable),
    hasUi: booleanValue(capabilitiesRaw.hasUi)
  };
  const permissions = {
    network: booleanValue(permissionsRaw.network),
    filesystem: arrayStrings(permissionsRaw.filesystem),
    requiresOwnerApproval: booleanValue(permissionsRaw.requiresOwnerApproval)
  };
  const lifecycle = await readLifecycle(appDir);
  return {
    id,
    name,
    description,
    version,
    path: appDir,
    source,
    entry,
    capabilities,
    permissions,
    lifecycle,
    diagnostics: customAppDiagnostics({ entry, capabilities, permissions })
  };
}

function customAppDiagnostics(app: Pick<CustomAppSummary, "entry" | "capabilities" | "permissions">): CustomAppDiagnostic[] {
  const diagnostics: CustomAppDiagnostic[] = [];
  if (!app.capabilities.agentCallable && !app.capabilities.commandCallable && !app.capabilities.scheduledCallable && !app.capabilities.hasUi) {
    diagnostics.push({ status: "warn", message: "未声明任何调用面，导入后无法被命令、定时任务或 UI 使用" });
  }
  if (app.entry.type === "webview" && !app.capabilities.hasUi) {
    diagnostics.push({ status: "warn", message: "entry.type=webview 但未声明 capabilities.hasUi=true" });
  }
  if (app.entry.type === "mcp-adapter") {
    diagnostics.push({ status: "warn", message: "mcp-adapter 仅作为生命周期和治理元数据接入，当前不会直接执行" });
  }
  if (app.entry.type === "workflow") {
    diagnostics.push({ status: "warn", message: "workflow 类型仅作为元数据接入，当前执行请使用套件 Workflow" });
  }
  if (app.entry.type === "executable" && !app.permissions.requiresOwnerApproval) {
    diagnostics.push({ status: "warn", message: "executable 入口建议开启 requiresOwnerApproval" });
  }
  if (app.permissions.network && !app.permissions.requiresOwnerApproval) {
    diagnostics.push({ status: "warn", message: "声明网络权限的应用建议开启 Owner 审批" });
  }
  for (const scope of app.permissions.filesystem) {
    if (!["workspace", "state", "readonly"].includes(scope)) {
      diagnostics.push({ status: "error", message: `不支持的 filesystem 权限：${scope}` });
    }
  }
  if (diagnostics.length === 0) diagnostics.push({ status: "ok", message: "manifest 校验通过" });
  return diagnostics;
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

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function cleanId(value: string): string {
  return /^[a-z0-9._-]+$/.test(value) ? value : "";
}

async function readLifecycle(appDir: string): Promise<NonNullable<CustomAppSummary["lifecycle"]>> {
  const lifecycle: Partial<NonNullable<CustomAppSummary["lifecycle"]>> = await readFile(path.join(appDir, ".qft-app-state.json"), "utf8")
    .then((value) => JSON.parse(value) as Partial<NonNullable<CustomAppSummary["lifecycle"]>>)
    .catch(() => ({}));
  return {
    installedAt: typeof lifecycle.installedAt === "string" ? lifecycle.installedAt : undefined,
    updatedAt: typeof lifecycle.updatedAt === "string" ? lifecycle.updatedAt : undefined,
    status: lifecycle.status === "installed" || lifecycle.status === "upgraded" ? lifecycle.status : "legacy"
  };
}

async function writeLifecycle(appDir: string, status: "installed" | "upgraded", installedAt?: string): Promise<void> {
  const existing: NonNullable<CustomAppSummary["lifecycle"]> = await readLifecycle(appDir).catch(() => ({ status: "legacy" as const }));
  const now = new Date().toISOString();
  await writeFile(path.join(appDir, ".qft-app-state.json"), `${JSON.stringify({
    installedAt: installedAt ?? existing.installedAt ?? now,
    updatedAt: now,
    status
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function listFiles(root: string, current: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === ".git") continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, target));
    else if (entry.name !== ".qft-app-state.json") result.push(path.relative(root, target));
    if (result.length >= 200) break;
  }
  return result;
}
