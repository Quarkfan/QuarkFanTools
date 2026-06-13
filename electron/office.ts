import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper";
import { XMLParser } from "fast-xml-parser";
import type { LarkMessage, LarkMessageResource } from "./types.js";

const OFFICE_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx"]);
const MAX_OFFICE_ENTRIES = 5_000;
const MAX_OFFICE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

export async function preprocessOfficeResources(message: LarkMessage, outputRoot: string, multimodalEnabled: boolean): Promise<LarkMessage> {
  const generated: LarkMessageResource[] = [];
  for (const resource of message.resources) {
    if (!resource.localPath) continue;
    const extension = path.extname(resource.localPath).toLowerCase() || path.extname(resource.name ?? "").toLowerCase();
    if (!OFFICE_EXTENSIONS.has(extension)) continue;
    const root = path.join(outputRoot, `office-${resource.key}`);
    const extracted = path.join(root, "ooxml");
    await mkdir(extracted, { recursive: true });
    const archive = await unzipper.Open.file(resource.localPath);
    const uncompressedBytes = archive.files.reduce((total, file) => total + Number(file.uncompressedSize || 0), 0);
    if (archive.files.length > MAX_OFFICE_ENTRIES || uncompressedBytes > MAX_OFFICE_UNCOMPRESSED_BYTES) {
      throw new Error(`Office 文件展开后超过安全限制: ${archive.files.length} entries / ${uncompressedBytes} bytes`);
    }
    await archive.extract({ path: extracted });
    const summaryPath = path.join(root, "content.txt");
    await writeFile(summaryPath, await officeTextSummary(extracted, extension), "utf8");
    generated.push({ key: `${resource.key}-content`, type: "file", name: "content.txt", localPath: summaryPath });

    if (extension === ".pptx" && multimodalEnabled) {
      const previewDir = path.join(root, "preview");
      await mkdir(previewDir, { recursive: true });
      await runQuickLook(resource.localPath, previewDir);
      for (const preview of await listFiles(previewDir)) {
        generated.push({ key: `${resource.key}-preview-${generated.length}`, type: "file", name: path.basename(preview), localPath: preview });
      }
    }
  }
  return generated.length > 0 ? { ...message, resources: [...message.resources, ...generated] } : message;
}

export async function officeTextSummary(root: string, extension: string): Promise<string> {
  const prefixes = extension === ".docx"
    ? ["word/"]
    : extension === ".pptx" ? ["ppt/slides/", "ppt/notesSlides/"] : ["xl/worksheets/", "xl/sharedStrings.xml", "xl/workbook.xml"];
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  const sections: string[] = [];
  for (const file of await listFiles(root)) {
    const relative = path.relative(root, file);
    if (!relative.endsWith(".xml") || !prefixes.some((prefix) => relative.startsWith(prefix))) continue;
    try {
      const values: string[] = [];
      collectText(parser.parse(await readFile(file, "utf8")), values);
      const text = values.map((value) => value.trim()).filter(Boolean).join(" ");
      if (text) sections.push(`## ${relative}\n${text}`);
    } catch {
      // Skip malformed or unsupported XML parts.
    }
  }
  return sections.join("\n\n") || "No readable Office Open XML text was found.";
}

function collectText(value: unknown, result: string[]): void {
  if (typeof value === "string" || typeof value === "number") {
    result.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectText(child, result);
    return;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectText(child, result);
  }
}

async function runQuickLook(source: string, outputDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/qlmanage", ["-p", "-o", outputDir, source], { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stderr?.on("data", (chunk) => (error += String(chunk)));
    child.on("exit", (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(error || `macOS Quick Look exited ${code}`));
    });
  });
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(target));
    else files.push(target);
  }
  return files;
}
