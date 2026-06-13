import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { officeTextSummary } from "../office.js";

test("extracts readable text from Office Open XML without external tools", async () => {
  const root = path.join(os.tmpdir(), `quarkfantools-office-${Date.now()}`);
  await mkdir(path.join(root, "ppt", "slides"), { recursive: true });
  await writeFile(
    path.join(root, "ppt", "slides", "slide1.xml"),
    `<p:sld xmlns:a="a" xmlns:p="p"><a:t>Quarterly overview</a:t><a:t>Revenue grew 20%</a:t></p:sld>`,
    "utf8"
  );
  const summary = await officeTextSummary(root, ".pptx");
  assert.match(summary, /Quarterly overview/);
  assert.match(summary, /Revenue grew 20%/);
  await rm(root, { recursive: true, force: true });
});
