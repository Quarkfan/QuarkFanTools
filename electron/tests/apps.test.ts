import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { copyCustomAppTemplate, discoverCustomApps, importCustomAppFolder, removeCustomAppFolder, saveCustomAppManifest, upgradeCustomAppFolder } from "../apps.js";

test("imports, upgrades, diagnoses, and removes custom apps", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-app-test-"));
  process.chdir(root);
  try {
    const source = path.join(root, "source", "daily-report");
    await writeCustomApp(source, "1.0.0");

    await importCustomAppFolder(source);
    let apps = await discoverCustomApps();
    assert.equal(apps.length, 1);
    assert.equal(apps[0]?.id, "daily-report");
    assert.equal(apps[0]?.lifecycle?.status, "installed");
    assert.equal(apps[0]?.diagnostics?.[0]?.status, "ok");

    const state = JSON.parse(await readFile(path.join(root, "apps", "daily-report", ".qft-app-state.json"), "utf8")) as { installedAt: string; updatedAt: string };
    const upgradeSource = path.join(root, "source", "daily-report-v2");
    await writeCustomApp(upgradeSource, "2.0.0");
    await upgradeCustomAppFolder(upgradeSource);
    apps = await discoverCustomApps();
    assert.equal(apps[0]?.version, "2.0.0");
    assert.equal(apps[0]?.lifecycle?.status, "upgraded");
    assert.equal(apps[0]?.lifecycle?.installedAt, state.installedAt);

    assert.equal(await removeCustomAppFolder("daily-report"), true);
    assert.deepEqual(await discoverCustomApps(), []);
  } finally {
    process.chdir(previousCwd);
  }
});

test("rejects custom apps with unsupported filesystem permissions", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-app-bad-test-"));
  process.chdir(root);
  try {
    const source = path.join(root, "source", "bad-app");
    await writeCustomApp(source, "1.0.0", ["workspace", "/etc"]);
    await assert.rejects(() => importCustomAppFolder(source), /filesystem/);
  } finally {
    process.chdir(previousCwd);
  }
});

test("discovers built-in custom app templates before local apps", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-app-builtin-test-"));
  process.chdir(root);
  try {
    await writeCustomApp(path.join(root, "builtin-apps", "builtin-daily-report"), "1.0.0");
    await writeCustomApp(path.join(root, "apps", "local-daily-report"), "2.0.0");
    await writeCustomApp(path.join(root, "apps", "local-ops"), "1.0.0", ["workspace"], "local-ops");

    const apps = await discoverCustomApps();
    assert.equal(apps.length, 2);
    assert.equal(apps.find((item) => item.id === "daily-report")?.source, "builtin");
    assert.equal(apps.find((item) => item.id === "daily-report")?.version, "1.0.0");
    assert.equal(apps.find((item) => item.id === "local-ops")?.source, "local");
  } finally {
    process.chdir(previousCwd);
  }
});

test("copies built-in custom app templates and edits local manifests with rollback", async () => {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "qft-app-edit-test-"));
  process.chdir(root);
  try {
    await writeCustomApp(path.join(root, "builtin-apps", "builtin-daily-report"), "1.0.0");
    await copyCustomAppTemplate("daily-report", "daily-report-local");
    let apps = await discoverCustomApps();
    const local = apps.find((item) => item.id === "daily-report-local");
    assert.equal(local?.source, "local");
    assert.equal(local?.name, "Daily Report 副本");

    const edited = JSON.parse(await readFile(path.join(root, "apps", "daily-report-local", "app.json"), "utf8")) as Record<string, unknown>;
    edited.description = "Edited from UI";
    await saveCustomAppManifest("daily-report-local", JSON.stringify(edited, null, 2));
    apps = await discoverCustomApps();
    assert.equal(apps.find((item) => item.id === "daily-report-local")?.description, "Edited from UI");

    await assert.rejects(() => saveCustomAppManifest("daily-report-local", "{ bad json"), /Unexpected|JSON/);
    apps = await discoverCustomApps();
    assert.equal(apps.find((item) => item.id === "daily-report-local")?.description, "Edited from UI");

    await assert.rejects(() => saveCustomAppManifest("daily-report", JSON.stringify(edited)), /内置自定义应用模板不能直接编辑/);
  } finally {
    process.chdir(previousCwd);
  }
});

async function writeCustomApp(source: string, version: string, filesystem: string[] = ["workspace"], id = "daily-report"): Promise<void> {
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "index.js"), "process.stdout.write(JSON.stringify({ ok: true, reply: 'ok' }))");
  await writeFile(path.join(source, "app.json"), `${JSON.stringify({
    id,
    name: "Daily Report",
    description: "Create daily reports",
    version,
    entry: { type: "node", command: "node", args: ["index.js"] },
    capabilities: { commandCallable: true, scheduledCallable: true },
    permissions: { network: false, filesystem, requiresOwnerApproval: false }
  }, null, 2)}\n`);
}
