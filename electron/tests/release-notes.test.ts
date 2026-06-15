import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { appInfo } from "../release-notes.js";

test("current package version is the latest user-facing release note", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  const info = appInfo(packageJson.version);

  assert.equal(info.version, packageJson.version);
  assert.equal(info.releases[0]?.version, packageJson.version);
  assert.ok(info.releases[0]?.highlights.length);
  assert.equal(new Set(info.releases.map((release) => release.version)).size, info.releases.length);
});
