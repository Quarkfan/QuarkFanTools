import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { analyzeSkillImport, importSkillFolderWithStrategy } from "../skills.js";

test("resolves local skill import conflicts by keeping or overwriting", async () => {
  const unique = `qft-test-skill-${Date.now()}`;
  const sourceRoot = await mkdir(path.join(os.tmpdir(), `${unique}-source`), { recursive: true }).then(() => path.join(os.tmpdir(), `${unique}-source`));
  const newRoot = await mkdir(path.join(os.tmpdir(), `${unique}-new`), { recursive: true }).then(() => path.join(os.tmpdir(), `${unique}-new`));
  const targetRoot = path.resolve("skills", path.basename(sourceRoot));
  try {
    await writeSkill(sourceRoot, unique, "old version");
    await writeSkill(newRoot, unique, "new version");
    await importSkillFolderWithStrategy(sourceRoot, "overwrite");

    const conflict = await analyzeSkillImport(newRoot);
    assert.equal(conflict.hasConflict, true);
    assert.equal(conflict.reason, "same-name");

    const kept = await importSkillFolderWithStrategy(newRoot, "keep");
    assert.equal(path.resolve(kept), path.resolve(targetRoot));
    assert.match(await readFile(path.join(targetRoot, "SKILL.md"), "utf8"), /old version/);

    await importSkillFolderWithStrategy(newRoot, "overwrite");
    assert.match(await readFile(path.join(targetRoot, "SKILL.md"), "utf8"), /new version/);
  } finally {
    await Promise.all([
      rm(sourceRoot, { recursive: true, force: true }),
      rm(newRoot, { recursive: true, force: true }),
      rm(targetRoot, { recursive: true, force: true })
    ]);
  }
});

async function writeSkill(root: string, name: string, body: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "SKILL.md"), [
    "---",
    `name: ${name}`,
    "description: test skill",
    "---",
    "",
    body,
    ""
  ].join("\n"));
}
