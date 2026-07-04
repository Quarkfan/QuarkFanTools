import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { DEFAULT_PLAYWRIGHT_ALLOWED_TOOLS, defaultPlaywrightMcpServer } from "../default-mcp.js";

test("builds default Playwright MCP server with isolated headless Chrome", () => {
  const workspace = path.join(process.cwd(), "tmp-workspace");
  const server = defaultPlaywrightMcpServer({
    workspace,
    electronExecutable: "/Applications/QuarkfanTools.app/Contents/MacOS/QuarkfanTools",
    packaged: true,
    resourcesPath: "/Applications/QuarkfanTools.app/Contents/Resources",
    cwd: "/repo"
  });

  assert.equal(server.type, "stdio");
  assert.equal(server.command, "/Applications/QuarkfanTools.app/Contents/MacOS/QuarkfanTools");
  assert.deepEqual(server.env, { ELECTRON_RUN_AS_NODE: "1" });
  assert.ok(server.args?.[0]?.endsWith(path.join("app.asar", "node_modules", "@playwright", "mcp", "cli.js")));
  assert.ok(server.args?.includes("--headless"));
  assert.ok(server.args?.includes("--isolated"));
  assert.deepEqual(server.args?.slice(server.args.indexOf("--browser"), server.args.indexOf("--browser") + 2), ["--browser", "chrome"]);
  assert.deepEqual(server.args?.slice(server.args.indexOf("--output-dir"), server.args.indexOf("--output-dir") + 2), ["--output-dir", path.join(workspace, ".playwright")]);
});

test("allows core Playwright browser MCP tools", () => {
  assert.ok(DEFAULT_PLAYWRIGHT_ALLOWED_TOOLS.includes("mcp__playwright__browser_navigate"));
  assert.ok(DEFAULT_PLAYWRIGHT_ALLOWED_TOOLS.includes("mcp__playwright__browser_snapshot"));
  assert.ok(DEFAULT_PLAYWRIGHT_ALLOWED_TOOLS.includes("mcp__playwright__browser_take_screenshot"));
});
