import { access, cp, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { builtinSkillsRoot, skillsRoot } from "./paths.js";
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
  for (const root of [userRoot, builtinSkillsRoot()]) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(root, entry.name);
      const skillPath = path.join(skillDir, "SKILL.md");
      try {
        const content = await readFile(skillPath, "utf8");
        const name = frontmatterValue(content, "name") || entry.name;
        if (names.has(name)) continue;
        names.add(name);
        skills.push({
          name,
          description: frontmatterValue(content, "description"),
          path: skillPath,
          knowledgePath: path.join(skillDir, "knowledge")
        });
      } catch {
        // Ignore directories without a valid SKILL.md.
      }
    }
  }
  return skills;
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
