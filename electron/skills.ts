import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { skillsRoot } from "./paths.js";
import type { SkillSummary } from "./types.js";

function frontmatterValue(content: string, key: string): string {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

export async function discoverSkills(): Promise<SkillSummary[]> {
  const root = skillsRoot();
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const skills: SkillSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(root, entry.name);
    const skillPath = path.join(skillDir, "SKILL.md");
    try {
      const content = await readFile(skillPath, "utf8");
      skills.push({
        name: frontmatterValue(content, "name") || entry.name,
        description: frontmatterValue(content, "description"),
        path: skillPath,
        knowledgePath: path.join(skillDir, "knowledge")
      });
    } catch {
      // Ignore directories without a valid SKILL.md.
    }
  }
  return skills;
}
