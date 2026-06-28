import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { copySuiteTemplate, discoverSuites, importSuiteFolder, removeSuiteFolder, saveSuiteManifest, suitePreview, upgradeSuiteFolder } from "../suites.js";

test("imports, upgrades, diagnoses, previews, and removes suites", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-suite-test-"));
  process.chdir(root);
  try {
    const source = path.join(root, "source", "qa-suite");
    await writeSuite(source, "1.0.0");

    await importSuiteFolder(source);
    let suites = await discoverSuites();
    assert.equal(suites.length, 1);
    assert.equal(suites[0]?.id, "qa-suite");
    assert.equal(suites[0]?.version, "1.0.0");
    assert.equal(suites[0]?.trusted, true);
    assert.deepEqual(suites[0]?.tags, ["quality"]);
    assert.equal(suites[0]?.lifecycle?.status, "installed");
    assert.equal(suites[0]?.diagnostics?.[0]?.status, "ok");
    assert.equal(suites[0]?.workflows[0]?.steps[0]?.condition?.includes, "ready");
    assert.equal(suites[0]?.workflows[0]?.steps[0]?.repeat?.maxTimes, 3);
    assert.equal(suites[0]?.workflows[0]?.steps[1]?.continueOnError, true);

    const state = JSON.parse(await readFile(path.join(root, "suites", "qa-suite", ".qft-suite-state.json"), "utf8")) as { installedAt: string };
    const preview = await suitePreview("qa-suite");
    assert.equal(preview.files.includes(".qft-suite-state.json"), false);

    const upgradeSource = path.join(root, "source", "qa-suite-v2");
    await writeSuite(upgradeSource, "2.0.0");
    await upgradeSuiteFolder(upgradeSource);
    suites = await discoverSuites();
    assert.equal(suites[0]?.version, "2.0.0");
    assert.equal(suites[0]?.lifecycle?.status, "upgraded");
    assert.equal(suites[0]?.lifecycle?.installedAt, state.installedAt);

    assert.equal(await removeSuiteFolder("qa-suite"), true);
    assert.deepEqual(await discoverSuites(), []);
  } finally {
    process.chdir(previousCwd);
  }
});

test("rejects suites with duplicate workflow step ids", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-suite-bad-test-"));
  process.chdir(root);
  try {
    const source = path.join(root, "source", "bad-suite");
    await writeSuite(source, "1.0.0", true);
    await assert.rejects(() => importSuiteFolder(source), /重复步骤 ID/);
  } finally {
    process.chdir(previousCwd);
  }
});

test("discovers built-in suite templates before local suites", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-suite-builtin-test-"));
  process.chdir(root);
  try {
    await writeSuite(path.join(root, "builtin-suites", "builtin-qa-suite"), "1.0.0");
    await writeSuite(path.join(root, "suites", "local-qa-suite"), "2.0.0");
    await writeSuite(path.join(root, "suites", "local-ops-suite"), "1.0.0", false, "ops-suite");

    const suites = await discoverSuites();
    assert.equal(suites.length, 2);
    assert.equal(suites.find((item) => item.id === "qa-suite")?.source, "builtin");
    assert.equal(suites.find((item) => item.id === "qa-suite")?.version, "1.0.0");
    assert.equal(suites.find((item) => item.id === "ops-suite")?.source, "local");
  } finally {
    process.chdir(previousCwd);
  }
});

test("copies built-in suite templates and edits local manifests with rollback", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-suite-edit-test-"));
  process.chdir(root);
  try {
    await writeSuite(path.join(root, "builtin-suites", "builtin-qa-suite"), "1.0.0");
    await copySuiteTemplate("qa-suite", "qa-suite-local");
    let suites = await discoverSuites();
    const local = suites.find((item) => item.id === "qa-suite-local");
    assert.equal(local?.source, "local");
    assert.equal(local?.name, "QA Suite 副本");

    const edited = JSON.parse(await readFile(path.join(root, "suites", "qa-suite-local", "suite.json"), "utf8")) as Record<string, unknown>;
    edited.description = "Edited from UI";
    await saveSuiteManifest("qa-suite-local", JSON.stringify(edited, null, 2));
    suites = await discoverSuites();
    assert.equal(suites.find((item) => item.id === "qa-suite-local")?.description, "Edited from UI");

    await assert.rejects(() => saveSuiteManifest("qa-suite-local", "{ bad json"), /Unexpected|JSON/);
    suites = await discoverSuites();
    assert.equal(suites.find((item) => item.id === "qa-suite-local")?.description, "Edited from UI");

    await assert.rejects(() => saveSuiteManifest("qa-suite", JSON.stringify(edited)), /内置套件模板不能直接编辑/);
  } finally {
    process.chdir(previousCwd);
  }
});

async function writeSuite(source: string, version: string, duplicateStep = false, id = duplicateStep ? "bad-suite" : "qa-suite"): Promise<void> {
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "suite.json"), `${JSON.stringify({
    id,
    name: "QA Suite",
    description: "Quality workflows",
    version,
    publisher: "BlackLake",
    trusted: true,
    tags: ["quality"],
    skills: ["quality-review"],
    apps: [],
    mcpServers: ["quality-db"],
    instructions: "Prefer structured quality workflows.",
    workflows: [{
      id: "root-cause",
      name: "Root Cause",
      prompt: "Analyze quality defect.",
      steps: [
        {
          id: "collect",
          name: "Collect",
          type: "prompt",
          prompt: "Collect facts.",
          input: "{{input}}\n{{previous}}",
          condition: { if: "{{input}}", includes: "ready" },
          repeat: { maxTimes: 3, until: { if: "{{previous}}", includes: "done" } },
          retry: { maxAttempts: 2 },
          timeoutSeconds: 30
        },
        {
          id: duplicateStep ? "collect" : "summarize",
          name: "Summarize",
          type: "capability",
          prompt: "Summarize.",
          continueOnError: true,
          capability: { kind: "mcp", id: "quality-db" }
        }
      ]
    }]
  }, null, 2)}\n`);
}
