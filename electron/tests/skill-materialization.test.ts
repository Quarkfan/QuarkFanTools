import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeSkillCopies } from "../claude.js";
import type { SkillSummary } from "../types.js";

test("materializes authorized skills as managed copies", async () => {
  const root = path.join(os.tmpdir(), `quarkfantools-skills-${Date.now()}`);
  const source = path.join(root, "market", "sales-skill");
  const targetRoot = path.join(root, "workspace", "skills");
  await mkdir(path.join(source, ".git"), { recursive: true });
  await writeFile(path.join(source, "SKILL.md"), "name: sales-skill\ndescription: Sales helper\n", "utf8");
  await writeFile(path.join(source, "knowledge.md"), "pricing rules", "utf8");
  await writeFile(path.join(source, ".git", "config"), "should not copy", "utf8");

  const skill: SkillSummary = {
    name: "sales-skill",
    description: "Sales helper",
    path: path.join(source, "SKILL.md"),
    knowledgePath: null,
    source: "market"
  };
  await materializeSkillCopies(targetRoot, [skill]);

  const target = path.join(targetRoot, "sales-skill");
  assert.equal((await lstat(target)).isSymbolicLink(), false);
  assert.match(await readFile(path.join(target, "SKILL.md"), "utf8"), /Sales helper/);
  assert.match(await readFile(path.join(target, "knowledge.md"), "utf8"), /pricing rules/);
  await assert.rejects(() => readFile(path.join(target, ".git", "config"), "utf8"));
  assert.match(await readFile(path.join(target, ".quarkfantools-materialized.json"), "utf8"), /"source": "market"/);

  await rm(root, { recursive: true, force: true });
});
