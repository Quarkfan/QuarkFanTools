import path from "node:path";
import type { McpServerConfig as ClaudeMcpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export const DEFAULT_PLAYWRIGHT_ALLOWED_TOOLS = [
  "mcp__playwright__browser_click",
  "mcp__playwright__browser_close",
  "mcp__playwright__browser_console_messages",
  "mcp__playwright__browser_drag",
  "mcp__playwright__browser_evaluate",
  "mcp__playwright__browser_file_upload",
  "mcp__playwright__browser_fill_form",
  "mcp__playwright__browser_handle_dialog",
  "mcp__playwright__browser_hover",
  "mcp__playwright__browser_navigate",
  "mcp__playwright__browser_navigate_back",
  "mcp__playwright__browser_network_request",
  "mcp__playwright__browser_network_requests",
  "mcp__playwright__browser_press_key",
  "mcp__playwright__browser_resize",
  "mcp__playwright__browser_select_option",
  "mcp__playwright__browser_snapshot",
  "mcp__playwright__browser_take_screenshot",
  "mcp__playwright__browser_tabs",
  "mcp__playwright__browser_type",
  "mcp__playwright__browser_wait_for"
];

export interface DefaultPlaywrightMcpOptions {
  workspace: string;
  electronExecutable: string;
  packaged: boolean;
  resourcesPath: string;
  cwd: string;
}

export function defaultPlaywrightMcpServer(options: DefaultPlaywrightMcpOptions): ClaudeMcpServerConfig {
  return {
    type: "stdio",
    command: options.electronExecutable,
    args: [
      playwrightMcpCliPath(options),
      "--headless",
      "--isolated",
      "--browser",
      "chrome",
      "--output-dir",
      path.join(options.workspace, ".playwright"),
      "--output-mode",
      "file"
    ],
    env: {
      ELECTRON_RUN_AS_NODE: "1"
    },
    timeout: 30000
  };
}

function playwrightMcpCliPath(options: Pick<DefaultPlaywrightMcpOptions, "packaged" | "resourcesPath" | "cwd">): string {
  const nodeModulesRoot = options.packaged
    ? path.join(options.resourcesPath, "app.asar", "node_modules")
    : path.join(options.cwd, "node_modules");
  return path.join(nodeModulesRoot, "@playwright", "mcp", "cli.js");
}
