import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { backupLegacyDataBeforeMigration } from "../paths.js";

test("backs up legacy qah data before migration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-paths-"));
  const legacyRoot = path.join(root, "qah");
  const targetRoot = path.join(root, "QuarkfanTools");
  await mkdir(path.join(legacyRoot, "config"), { recursive: true });
  await writeFile(path.join(legacyRoot, "config", "local.json"), "{\"ok\":true}\n", "utf8");

  const backupRoot = await backupLegacyDataBeforeMigration(legacyRoot, targetRoot, "2026-06-23T00-00-00-000Z");

  assert.equal(backupRoot, path.join(targetRoot, "backups", "legacy-qah-2026-06-23T00-00-00-000Z"));
  assert.equal(existsSync(path.join(backupRoot, "config", "local.json")), true);
  assert.match(await readFile(path.join(backupRoot, "BACKUP-README.txt"), "utf8"), /legacy qah data backup/);
});
