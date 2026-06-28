import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { latestMcpProbeSummaries, mcpServerDiagnostics } from "../mcp-diagnostics.js";
import type { AppConfig } from "../types.js";

const baseConfig: AppConfig = {
  bots: [{
    id: "bot-1",
    name: "Bot 1",
    enabled: true,
    cliPath: "",
    profile: "",
    appId: "cli_test",
    appSecret: "secret",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    oauthScopes: [],
    skillNames: [],
    capabilityRefs: [{ kind: "mcp", id: "node-mcp", enabled: true, policy: { allowAgentUse: true } }],
    commandBindings: [],
    scheduledTasks: [],
    pendingReaction: "OnIt",
    ownerOpenId: "",
    showProgress: false
  }],
  mcpServers: [],
  ui: { theme: "system" },
  skillMarket: { enabled: false, repositoryUrl: "", branch: "main", token: "" },
  model: { providerId: "", providerName: "", baseUrl: "", model: "", apiKeyEnv: "", apiKey: "", multimodalEnabled: false },
  runtime: { sandbox: "workspace-write", approvalPolicy: "never", maxConcurrentTasks: 2, maxAgentTurns: 60 }
};

test("diagnoses MCP command resolution and bot authorization", async () => {
  const diagnostics = await mcpServerDiagnostics({
    ...baseConfig,
    mcpServers: [
      { id: "node-mcp", name: "Node MCP", enabled: true, transport: "stdio", command: process.execPath, args: ["server.js"], env: [], description: "" },
      { id: "unused-mcp", name: "Unused MCP", enabled: true, transport: "stdio", command: process.execPath, args: [], env: [], description: "" },
      { id: "broken-mcp", name: "Broken MCP", enabled: true, transport: "stdio", command: "/not/a/real/mcp", args: [], env: [{ name: "TOKEN", value: "" }], description: "" }
    ]
  });

  assert.equal(diagnostics.find((item) => item.id === "node-mcp")?.status, "ok");
  assert.deepEqual(diagnostics.find((item) => item.id === "node-mcp")?.authorizedBotNames, ["Bot 1"]);
  assert.equal(diagnostics.find((item) => item.id === "unused-mcp")?.status, "warn");
  assert.match(diagnostics.find((item) => item.id === "unused-mcp")?.issues.join("\n") ?? "", /尚未授权/);
  assert.equal(diagnostics.find((item) => item.id === "broken-mcp")?.status, "error");
  assert.match(diagnostics.find((item) => item.id === "broken-mcp")?.issues.join("\n") ?? "", /无法[\s\S]*环境变量/);
});

test("diagnoses HTTP MCP as configurable but not runtime-ready", async () => {
  const diagnostics = await mcpServerDiagnostics({
    ...baseConfig,
    bots: [{
      ...baseConfig.bots[0]!,
      capabilityRefs: [{ kind: "mcp", id: "remote-mcp", enabled: true, policy: { allowAgentUse: true } }]
    }],
    mcpServers: [
      { id: "remote-mcp", name: "Remote MCP", enabled: true, transport: "http", command: "", args: [], url: "https://example.com/mcp", env: [], description: "" }
    ]
  });

  assert.equal(diagnostics[0]?.status, "warn");
  assert.match(diagnostics[0]?.issues.join("\n") ?? "", /运行时注入/);
  assert.equal(diagnostics[0]?.protocol?.status, "not-run");
});


test("probes stdio MCP protocol and lists tools on demand", async () => {
  await withTempProject(async () => {
    const serverCode = `
let buffer = Buffer.alloc(0);
function frame(value) {
  const body = JSON.stringify(value);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
}
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const end = buffer.indexOf("\\r\\n\\r\\n");
    if (end < 0) return;
    const header = buffer.subarray(0, end).toString();
    const match = /Content-Length:\\s*(\\d+)/i.exec(header);
    const length = Number(match && match[1]);
    const start = end + 4;
    if (buffer.length < start + length) return;
    const message = JSON.parse(buffer.subarray(start, start + length).toString());
    buffer = buffer.subarray(start + length);
    if (message.method === "initialize") frame({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake", version: "1.0.0" } } });
    if (message.method === "tools/list") frame({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "search_docs" }, { name: "summarize" }] } });
  }
});
`;
    const config: AppConfig = {
      ...baseConfig,
      mcpServers: [
        { id: "node-mcp", name: "Node MCP", enabled: true, transport: "stdio", command: process.execPath, args: ["-e", serverCode], env: [], description: "", timeoutMs: 2000 }
      ]
    };
    const diagnostics = await mcpServerDiagnostics(config, { probeProtocol: true });

    const diagnostic = diagnostics[0];
    assert.equal(diagnostic?.status, "ok");
    assert.equal(diagnostic?.protocol?.status, "ok");
    assert.deepEqual(diagnostic?.protocol?.tools, ["search_docs", "summarize"]);

    const content = await readFile(path.join("state", "mcp-diagnostics.jsonl"), "utf8");
    const records = content.trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.serverId, "node-mcp");
    assert.equal(records[0]?.status, "ok");
    assert.deepEqual(records[0]?.tools, ["search_docs", "summarize"]);

    const staticDiagnostics = await mcpServerDiagnostics(config);
    assert.equal(staticDiagnostics[0]?.protocol?.status, "not-run");
    assert.equal(staticDiagnostics[0]?.lastProbe?.status, "ok");
    assert.deepEqual(staticDiagnostics[0]?.lastProbe?.tools, ["search_docs", "summarize"]);
  });
});

test("keeps MCP startup failure stderr and exit code in protocol diagnostics", async () => {
  await withTempProject(async () => {
    const diagnostics = await mcpServerDiagnostics({
      ...baseConfig,
      mcpServers: [
        {
          id: "node-mcp",
          name: "Node MCP",
          enabled: true,
          transport: "stdio",
          command: process.execPath,
          args: ["-e", "console.error('missing token'); process.exit(42);"],
          env: [],
          description: "",
          timeoutMs: 1000
        }
      ]
    }, { probeProtocol: true });

    const diagnostic = diagnostics[0];
    assert.equal(diagnostic?.status, "error");
    assert.equal(diagnostic?.protocol?.status, "failed");
    assert.equal(diagnostic?.protocol?.exitCode, 42);
    assert.match(diagnostic?.protocol?.stderrTail ?? "", /missing token/);

    const summaries = await latestMcpProbeSummaries();
    assert.equal(summaries.get("node-mcp")?.status, "failed");
    assert.equal(summaries.get("node-mcp")?.exitCode, 42);
    assert.match(summaries.get("node-mcp")?.stderrTail ?? "", /missing token/);
  });
});

async function withTempProject(run: () => Promise<void>): Promise<void> {
  const previous = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), "qft-mcp-diagnostics-"));
  try {
    process.chdir(root);
    await run();
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
}
