import path from "node:path";
import type { CustomAppSummary } from "./types.js";

export function normalizeNodeArgs(customApp: CustomAppSummary): string[] {
  const command = (customApp.entry.command ?? "").trim();
  const rawArgs = [...(customApp.entry.args ?? [])];
  if (isNodeCommand(command)) {
    if (rawArgs.length === 0) {
      throw new Error(`${customApp.name} 缺少 Node 入口脚本`);
    }
    const [script, ...rest] = rawArgs;
    return [path.resolve(customApp.path, script), ...rest];
  }
  return [path.resolve(customApp.path, command), ...rawArgs];
}

function isNodeCommand(command: string): boolean {
  return ["node", "node.exe"].includes(path.basename(command).toLowerCase());
}
