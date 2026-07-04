import { access, cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { builtinSkillsRoot, marketSkillsRoot, skillsRoot } from "./paths.js";
import type { SkillPreview, SkillSummary } from "./types.js";

function frontmatterValue(content: string, key: string): string {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

export async function discoverSkills(): Promise<SkillSummary[]> {
  const skills: SkillSummary[] = [];
  const names = new Set<string>();
  const userRoot = skillsRoot();
  await mkdir(userRoot, { recursive: true });
  const roots = [
    { path: userRoot, source: "local" as const },
    { path: marketSkillsRoot(), source: "market" as const },
    { path: builtinSkillsRoot(), source: "builtin" as const }
  ];
  for (const root of roots) {
    for (const skillDir of await skillDirectories(root.path)) {
      const entryName = path.basename(skillDir);
      const skillPath = path.join(skillDir, "SKILL.md");
      try {
        const content = await readFile(skillPath, "utf8");
        let name = frontmatterValue(content, "name") || entryName;
        if (names.has(name)) {
          if (entryName && !names.has(entryName)) name = entryName;
          else continue;
        }
        names.add(name);
        skills.push({
          name,
          description: frontmatterValue(content, "description"),
          path: skillPath,
          knowledgePath: path.join(skillDir, "knowledge"),
          source: root.source
        });
      } catch {
        // Ignore directories without a valid SKILL.md.
      }
    }
  }
  return skills;
}

async function skillDirectories(root: string): Promise<string[]> {
  const result: string[] = [];
  try {
    await access(path.join(root, "SKILL.md"));
    result.push(root);
  } catch {
    // The root may be a marketplace containing multiple skills.
  }
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".git") continue;
    const first = path.join(root, entry.name);
    try {
      await access(path.join(first, "SKILL.md"));
      result.push(first);
      continue;
    } catch {
      // Market repositories commonly group skills one directory deeper.
    }
    for (const child of await readdir(first, { withFileTypes: true }).catch(() => [])) {
      if (!child.isDirectory()) continue;
      try {
        const target = path.join(first, child.name);
        await access(path.join(target, "SKILL.md"));
        result.push(target);
      } catch {
        // Ignore non-skill directories.
      }
    }
  }
  return result;
}

export async function importSkillFolder(source: string): Promise<string> {
  return importSkillFolderWithStrategy(source, "overwrite");
}

export type SkillImportStrategy = "overwrite" | "keep";

export interface SkillImportConflict {
  hasConflict: boolean;
  declaredName: string;
  sourcePath: string;
  targetPath: string;
  existingPath?: string;
  existingName?: string;
  reason?: "same-directory" | "same-name";
}

export async function analyzeSkillImport(source: string): Promise<SkillImportConflict> {
  const sourceContent = await readFile(path.join(source, "SKILL.md"), "utf8");
  const declaredName = frontmatterValue(sourceContent, "name") || path.basename(source);
  const root = skillsRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, path.basename(source));
  const resolvedSource = path.resolve(source);
  const resolvedTarget = path.resolve(target);
  if (resolvedSource === resolvedTarget) {
    return { hasConflict: false, declaredName, sourcePath: resolvedSource, targetPath: resolvedTarget };
  }
  for (const skillDir of await skillDirectories(root)) {
    const resolvedSkillDir = path.resolve(skillDir);
    const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8").catch(() => "");
    const existingName = frontmatterValue(content, "name") || path.basename(skillDir);
    if (resolvedSkillDir === resolvedTarget) {
      return {
        hasConflict: true,
        declaredName,
        sourcePath: resolvedSource,
        targetPath: resolvedTarget,
        existingPath: resolvedSkillDir,
        existingName,
        reason: "same-directory"
      };
    }
    if (existingName === declaredName) {
      return {
        hasConflict: true,
        declaredName,
        sourcePath: resolvedSource,
        targetPath: resolvedSkillDir,
        existingPath: resolvedSkillDir,
        existingName,
        reason: "same-name"
      };
    }
  }
  return { hasConflict: false, declaredName, sourcePath: resolvedSource, targetPath: resolvedTarget };
}

export async function importSkillFolderWithStrategy(source: string, strategy: SkillImportStrategy): Promise<string> {
  const analysis = await analyzeSkillImport(source);
  if (strategy === "keep" && analysis.hasConflict) return analysis.existingPath ?? analysis.targetPath;
  const target = analysis.hasConflict && analysis.existingPath ? analysis.existingPath : analysis.targetPath;
  if (path.resolve(source) === path.resolve(target)) return target;
  if (strategy === "overwrite") await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, force: true });
  const imported = (await discoverSkills()).find((skill) => path.resolve(path.dirname(skill.path)) === path.resolve(target));
  if (!imported) throw new Error(`Skill 已复制，但无法发现“${analysis.declaredName}”；请检查 SKILL.md frontmatter`);
  return target;
}

export async function skillPreview(name: string): Promise<SkillPreview> {
  const skill = (await discoverSkills()).find((item) => item.name === name);
  if (!skill) throw new Error("Skill 不存在");
  const root = path.dirname(skill.path);
  return {
    name: skill.name,
    description: skill.description,
    source: skill.source,
    content: await readFile(skill.path, "utf8"),
    files: await listFiles(root, root)
  };
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

export async function removeLocalSkill(name: string): Promise<void> {
  const skill = (await discoverSkills()).find((item) => item.name === name);
  if (!skill || skill.source !== "local") throw new Error("只能删除导入到本地技能市场的 Skill");
  const root = path.resolve(skillsRoot());
  const target = path.resolve(path.dirname(skill.path));
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error("Skill 路径不在本地技能市场内");
  await rm(target, { recursive: true, force: true });
}
