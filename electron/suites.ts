import { access, cp, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { suitesRoot } from "./paths.js";
import type { SuitePreview, SuiteSummary, SuiteWorkflowStepSummary, SuiteWorkflowSummary } from "./types.js";

type RawManifest = Record<string, unknown>;

export async function discoverSuites(): Promise<SuiteSummary[]> {
  const root = suitesRoot();
  await mkdir(root, { recursive: true });
  const suites: SuiteSummary[] = [];
  const seen = new Set<string>();
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const suiteDir = path.join(root, entry.name);
    try {
      const suite = await readSuite(suiteDir);
      if (seen.has(suite.id)) continue;
      seen.add(suite.id);
      suites.push(suite);
    } catch {
      // Ignore incomplete suite directories; import and preview surface validation errors.
    }
  }
  return suites.sort((a, b) => a.name.localeCompare(b.name));
}

export async function importSuiteFolder(source: string): Promise<string> {
  const suite = await readSuite(source);
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
  await readSuite(target);
  return target;
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

async function readSuite(suiteDir: string): Promise<SuiteSummary> {
  const manifestText = await readFile(path.join(suiteDir, "suite.json"), "utf8");
  const manifest = JSON.parse(manifestText) as RawManifest;
  const id = cleanId(requiredString(manifest, "id"));
  if (!id) throw new Error("suite.json id 只能包含小写字母、数字、短横线、下划线和点");
  const workflows = Array.isArray(manifest.workflows)
    ? manifest.workflows
      .map((item) => workflowValue(item))
      .filter((item): item is SuiteWorkflowSummary => Boolean(item))
    : [];
  return {
    id,
    name: requiredString(manifest, "name"),
    description: stringValue(manifest.description),
    path: suiteDir,
    source: "local",
    skills: arrayStrings(manifest.skills),
    apps: arrayStrings(manifest.apps),
    mcpServers: arrayStrings(manifest.mcpServers),
    instructions: stringValue(manifest.instructions) || undefined,
    workflows
  };
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
  if (type === "capability") {
    const capability = record.capability && typeof record.capability === "object" ? record.capability as RawManifest : null;
    const kind = String(capability?.kind ?? "");
    const capabilityId = String(capability?.id ?? "").trim();
    if (!["skill", "app", "suite"].includes(kind) || !capabilityId) {
      throw new Error("suite.json workflow.steps[].capability 必须指向 skill、app 或 suite");
    }
    step.capability = {
      kind: kind as "skill" | "app" | "suite",
      id: capabilityId
    };
  }
  return step;
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
