import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { builtinSuitesRoot, suitesRoot } from "./paths.js";
import type { SuiteDiagnostic, SuitePreview, SuiteSummary, SuiteWorkflowStepSummary, SuiteWorkflowSummary, WorkflowStepCondition } from "./types.js";

type RawManifest = Record<string, unknown>;

export async function discoverSuites(): Promise<SuiteSummary[]> {
  const suites: SuiteSummary[] = [];
  const seen = new Set<string>();
  await appendDiscoveredSuites(suites, seen, builtinSuitesRoot(), "builtin", false);
  await mkdir(suitesRoot(), { recursive: true });
  await appendDiscoveredSuites(suites, seen, suitesRoot(), "local", true);
  return suites.sort((a, b) => a.name.localeCompare(b.name));
}

async function appendDiscoveredSuites(suites: SuiteSummary[], seen: Set<string>, root: string, source: SuiteSummary["source"], requireDirectory = true): Promise<void> {
  if (requireDirectory) await mkdir(root, { recursive: true });
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const suiteDir = path.join(root, entry.name);
    try {
      const suite = await readSuite(suiteDir, source);
      if (seen.has(suite.id)) continue;
      seen.add(suite.id);
      suites.push(suite);
    } catch {
      // Ignore incomplete suite directories; import and preview surface validation errors.
    }
  }
}

export async function importSuiteFolder(source: string): Promise<string> {
  const suite = await readSuite(source, "local");
  assertSuiteImportable(suite);
  const root = suitesRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, suite.id);
  if (path.resolve(source) === path.resolve(target)) return target;
  try {
    await access(target);
    throw new Error(`套件 ${suite.id} 已存在，请先删除或更换 suite.json id`);
  } catch (error) {
    if (String(error).includes("已存在")) throw error;
  }
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  await writeLifecycle(target, "installed");
  await readSuite(target, "local");
  return target;
}

export async function upgradeSuiteFolder(source: string): Promise<string> {
  const suite = await readSuite(source, "local");
  assertSuiteImportable(suite);
  const root = suitesRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, suite.id);
  await access(target).catch(() => {
    throw new Error(`套件 ${suite.id} 尚未安装，不能升级`);
  });
  const previousLifecycle = await readLifecycle(target);
  if (path.resolve(source) !== path.resolve(target)) {
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  }
  await writeLifecycle(target, "upgraded", previousLifecycle.installedAt);
  await readSuite(target, "local");
  return target;
}

export async function removeSuiteFolder(id: string): Promise<boolean> {
  if (!cleanId(id)) return false;
  await rm(path.join(suitesRoot(), id), { recursive: true, force: true });
  return true;
}

export async function suitePreview(id: string): Promise<SuitePreview> {
  const suite = (await discoverSuites()).find((item) => item.id === id);
  if (!suite) throw new Error("套件不存在");
  return {
    suite,
    manifest: await readFile(path.join(suite.path, "suite.json"), "utf8"),
    files: await listFiles(suite.path, suite.path)
  };
}

export async function saveSuiteManifest(id: string, manifestText: string): Promise<string> {
  if (!cleanId(id)) throw new Error("套件 ID 不合法");
  const suite = (await discoverSuites()).find((item) => item.id === id);
  if (!suite) throw new Error("套件不存在");
  if (suite.source !== "local") throw new Error("内置套件模板不能直接编辑，请先复制为本地副本。");
  const manifestPath = path.join(suite.path, "suite.json");
  const previous = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, ensureTrailingNewline(manifestText), { encoding: "utf8", mode: 0o600 });
  try {
    const updated = await readSuite(suite.path, "local");
    assertSuiteImportable(updated);
    if (updated.id !== id) throw new Error("编辑现有套件时不能修改 suite.json id；如需新 ID，请复制模板或重新导入。");
  } catch (error) {
    await writeFile(manifestPath, previous, { encoding: "utf8", mode: 0o600 });
    throw error;
  }
  await writeLifecycle(suite.path, "upgraded", suite.lifecycle?.installedAt);
  return manifestPath;
}

export async function copySuiteTemplate(id: string, newId: string): Promise<string> {
  const source = (await discoverSuites()).find((item) => item.id === id);
  if (!source) throw new Error("套件模板不存在");
  const cleanNewId = cleanId(newId);
  if (!cleanNewId) throw new Error("新套件 ID 只能包含小写字母、数字、短横线、下划线和点");
  const target = path.join(suitesRoot(), cleanNewId);
  await access(target).then(() => {
    throw new Error(`套件 ${cleanNewId} 已存在`);
  }).catch((error) => {
    if (String(error).includes("已存在")) throw error;
  });
  await mkdir(suitesRoot(), { recursive: true });
  await cp(source.path, target, { recursive: true, force: false, errorOnExist: true });
  const manifestPath = path.join(target, "suite.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RawManifest;
  manifest.id = cleanNewId;
  manifest.name = `${stringValue(manifest.name) || source.name} 副本`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await writeLifecycle(target, "installed");
  await readSuite(target, "local");
  return target;
}

async function readSuite(suiteDir: string, source: SuiteSummary["source"]): Promise<SuiteSummary> {
  const manifestText = await readFile(path.join(suiteDir, "suite.json"), "utf8");
  const manifest = JSON.parse(manifestText) as RawManifest;
  const id = cleanId(requiredString(manifest, "id"));
  if (!id) throw new Error("suite.json id 只能包含小写字母、数字、短横线、下划线和点");
  const version = stringValue(manifest.version) || "0.0.0";
  const workflows = Array.isArray(manifest.workflows)
    ? manifest.workflows
      .map((item) => workflowValue(item))
      .filter((item): item is SuiteWorkflowSummary => Boolean(item))
    : [];
  const summary = {
    id,
    name: requiredString(manifest, "name"),
    description: stringValue(manifest.description),
    version,
    publisher: stringValue(manifest.publisher) || undefined,
    trusted: manifest.trusted === true,
    tags: arrayStrings(manifest.tags).slice(0, 20),
    path: suiteDir,
    source,
    skills: arrayStrings(manifest.skills),
    apps: arrayStrings(manifest.apps),
    mcpServers: arrayStrings(manifest.mcpServers),
    instructions: stringValue(manifest.instructions) || undefined,
    workflows,
    lifecycle: await readLifecycle(suiteDir)
  };
  return { ...summary, diagnostics: suiteDiagnostics(summary) };
}

function requiredString(manifest: RawManifest, key: string): string {
  const value = stringValue(manifest[key]);
  if (!value) throw new Error(`suite.json 缺少 ${key}`);
  return value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function workflowValue(value: unknown): SuiteWorkflowSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as RawManifest;
  const id = cleanId(requiredString(record, "id"));
  const name = requiredString(record, "name");
  const prompt = requiredString(record, "prompt");
  if (!id) throw new Error("suite.json workflow.id 只能包含小写字母、数字、短横线、下划线和点");
  const steps = Array.isArray(record.steps)
    ? record.steps
      .map((item) => workflowStepValue(item))
      .filter((item): item is SuiteWorkflowStepSummary => Boolean(item))
    : [];
  return { id, name, prompt, steps };
}

function workflowStepValue(value: unknown): SuiteWorkflowStepSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as RawManifest;
  const id = cleanId(requiredString(record, "id"));
  if (!id) throw new Error("suite.json workflow.steps[].id 只能包含小写字母、数字、短横线、下划线和点");
  const type = record.type === "capability" ? "capability" : "prompt";
  const prompt = requiredString(record, "prompt");
  const step: SuiteWorkflowStepSummary = {
    id,
    name: stringValue(record.name) || id,
    type,
    prompt
  };
  const input = stringValue(record.input);
  if (input) step.input = input;
  const condition = workflowConditionValue(record.condition);
  if (condition) step.condition = condition;
  if (record.continueOnError === true) step.continueOnError = true;
  const repeat = workflowStepRepeatValue(record.repeat);
  if (repeat) step.repeat = repeat;
  const timeoutSeconds = positiveInteger(record.timeoutSeconds, 3600);
  if (timeoutSeconds) step.timeoutSeconds = timeoutSeconds;
  const retry = workflowStepRetryValue(record.retry);
  if (retry) step.retry = retry;
  if (type === "capability") {
    const capability = record.capability && typeof record.capability === "object" ? record.capability as RawManifest : null;
    const kind = String(capability?.kind ?? "");
    const capabilityId = String(capability?.id ?? "").trim();
    if (!["skill", "mcp", "app", "suite"].includes(kind) || !capabilityId) {
      throw new Error("suite.json workflow.steps[].capability 必须指向 skill、mcp、app 或 suite");
    }
    step.capability = {
      kind: kind as "skill" | "mcp" | "app" | "suite",
      id: capabilityId
    };
  }
  return step;
}

function cleanId(value: string): string {
  return /^[a-z0-9._-]+$/.test(value) ? value : "";
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function workflowStepRetryValue(value: unknown): SuiteWorkflowStepSummary["retry"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const maxAttempts = positiveInteger((value as RawManifest).maxAttempts, 10);
  return maxAttempts ? { maxAttempts } : undefined;
}

function workflowStepRepeatValue(value: unknown): SuiteWorkflowStepSummary["repeat"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as RawManifest;
  const maxTimes = positiveInteger(record.maxTimes, 20);
  if (!maxTimes) return undefined;
  const until = workflowConditionValue(record.until);
  return until ? { maxTimes, until } : { maxTimes };
}

function workflowConditionValue(value: unknown): WorkflowStepCondition | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as RawManifest;
  const condition: WorkflowStepCondition = {};
  const input = stringValue(record.if);
  const equals = stringValue(record.equals);
  const includes = stringValue(record.includes);
  const matches = stringValue(record.matches);
  if (input) condition.if = input;
  if (equals) condition.equals = equals;
  if (includes) condition.includes = includes;
  if (matches) condition.matches = matches;
  if (record.not === true) condition.not = true;
  return condition.if || condition.equals || condition.includes || condition.matches || condition.not ? condition : undefined;
}

function assertSuiteImportable(suite: SuiteSummary): void {
  const blocking = (suite.diagnostics ?? []).filter((item) => item.status === "error");
  if (blocking.length > 0) throw new Error(`套件 ${suite.id} 未通过校验：${blocking.map((item) => item.message).join("；")}`);
}

function suiteDiagnostics(suite: Pick<SuiteSummary, "skills" | "apps" | "mcpServers" | "workflows" | "instructions" | "trusted">): SuiteDiagnostic[] {
  const diagnostics: SuiteDiagnostic[] = [];
  if (!suite.trusted) diagnostics.push({ status: "warn", message: "未声明 trusted=true，授权给 Bot 前应确认来源" });
  if (!suite.skills.length && !suite.apps.length && !suite.mcpServers.length && !suite.workflows.length && !suite.instructions) {
    diagnostics.push({ status: "warn", message: "未声明可挂载能力或说明，导入后不会改变 Agent 行为" });
  }
  for (const workflow of suite.workflows) {
    const seen = new Set<string>();
    for (const step of workflow.steps) {
      if (seen.has(step.id)) diagnostics.push({ status: "error", message: `Workflow ${workflow.id} 存在重复步骤 ID：${step.id}` });
      seen.add(step.id);
      if (step.repeat?.maxTimes && step.repeat.maxTimes > 10 && !step.repeat.until) {
        diagnostics.push({ status: "warn", message: `Workflow ${workflow.id} 步骤 ${step.id} 循环超过 10 次且未声明 until` });
      }
    }
  }
  if (diagnostics.length === 0) diagnostics.push({ status: "ok", message: "manifest 校验通过" });
  return diagnostics;
}

async function readLifecycle(suiteDir: string): Promise<NonNullable<SuiteSummary["lifecycle"]>> {
  const lifecycle: Partial<NonNullable<SuiteSummary["lifecycle"]>> = await readFile(path.join(suiteDir, ".qft-suite-state.json"), "utf8")
    .then((value) => JSON.parse(value) as Partial<NonNullable<SuiteSummary["lifecycle"]>>)
    .catch(() => ({}));
  return {
    installedAt: typeof lifecycle.installedAt === "string" ? lifecycle.installedAt : undefined,
    updatedAt: typeof lifecycle.updatedAt === "string" ? lifecycle.updatedAt : undefined,
    status: lifecycle.status === "installed" || lifecycle.status === "upgraded" ? lifecycle.status : "legacy"
  };
}

async function writeLifecycle(suiteDir: string, status: "installed" | "upgraded", installedAt?: string): Promise<void> {
  const existing: NonNullable<SuiteSummary["lifecycle"]> = await readLifecycle(suiteDir).catch(() => ({ status: "legacy" as const }));
  const now = new Date().toISOString();
  await writeFile(path.join(suiteDir, ".qft-suite-state.json"), `${JSON.stringify({
    installedAt: installedAt ?? existing.installedAt ?? now,
    updatedAt: now,
    status
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function positiveInteger(value: unknown, max: number): number | undefined {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isInteger(raw) || raw < 1) return undefined;
  return Math.min(raw, max);
}

async function listFiles(root: string, current: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === ".git") continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, target));
    else if (entry.name !== ".qft-suite-state.json") result.push(path.relative(root, target));
    if (result.length >= 200) break;
  }
  return result;
}
