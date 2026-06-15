import { access, cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { builtinSkillsRoot, marketSkillsRoot, skillsRoot } from "./paths.js";
import type { SkillSummary } from "./types.js";

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
        const name = frontmatterValue(content, "name") || entryName;
        if (names.has(name)) continue;
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
  await access(path.join(source, "SKILL.md"));
  const root = skillsRoot();
  await mkdir(root, { recursive: true });
  const target = path.join(root, path.basename(source));
  if (path.resolve(source) === path.resolve(target)) return target;
  await cp(source, target, { recursive: true, force: true });
  return target;
}

export async function removeLocalSkill(name: string): Promise<void> {
  const skill = (await discoverSkills()).find((item) => item.name === name);
  if (!skill || skill.source !== "local") throw new Error("只能删除导入到本地技能市场的 Skill");
  const root = path.resolve(skillsRoot());
  const target = path.resolve(path.dirname(skill.path));
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error("Skill 路径不在本地技能市场内");
  await rm(target, { recursive: true, force: true });
}
