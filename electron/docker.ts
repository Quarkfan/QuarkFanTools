import { spawn } from "node:child_process";
import type { DockerCapability } from "./types.js";

export async function detectDocker(timeoutMs = 2000): Promise<DockerCapability> {
  const version = await runDocker(["--version"], timeoutMs);
  if (!version.ok) {
    return { installed: false, daemonRunning: false, version: "", error: version.error };
  }
  const info = await runDocker(["info", "--format", "{{.ServerVersion}}"], timeoutMs);
  return {
    installed: true,
    daemonRunning: info.ok,
    version: version.output,
    error: info.ok ? "" : info.error
  };
}

async function runDocker(args: string[], timeoutMs: number): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, error: `docker ${args.join(" ")} timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (error += String(chunk)));
    child.on("error", (spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, error: spawnError.message });
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ ok: true, output: output.trim() });
      } else {
        resolve({ ok: false, error: (error || output || `docker exited ${code}`).trim() });
      }
    });
  });
}
