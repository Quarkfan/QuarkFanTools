import assert from "node:assert/strict";
import test from "node:test";
import { runningBotWithSameAppId } from "../bot-identity.js";
import { mergeConfig } from "../config-merge.js";
import type { AppConfig } from "../types.js";

const base: AppConfig = {
  bots: [],
  mcpServers: [],
  ui: {
    theme: "system"
  },
  skillMarket: {
    enabled: false,
    repositoryUrl: "",
    branch: "main",
    token: ""
  },
  model: {
    providerId: "anthropic",
    providerName: "Claude Compatible",
    baseUrl: "",
    model: "",
    apiKeyEnv: "ANTHROPIC_AUTH_TOKEN",
    apiKey: "",
    multimodalEnabled: true
  },
  runtime: {
    sandbox: "workspace-write",
    approvalPolicy: "never",
    maxConcurrentTasks: 2,
    maxAgentTurns: 60
  }
};

test("migrates a legacy single bot config", () => {
  const config = mergeConfig(base, {
    lark: {
      cliPath: "",
      profile: "",
      appId: "cli_test",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: ["im.message.receive_v1"]
    }
  });

  assert.equal(config.bots.length, 1);
  assert.equal(config.bots[0]?.appId, "cli_test");
  assert.deepEqual(config.bots[0]?.skillNames, []);
  assert.deepEqual(config.bots[0]?.capabilityRefs, []);
  assert.deepEqual(config.bots[0]?.commandBindings, []);
  assert.deepEqual(config.bots[0]?.oauthScopes, []);
  assert.equal(config.bots[0]?.pendingReaction, "OnIt");
  assert.equal(config.model.multimodalEnabled, true);
});

test("removes wildcard skill access so new skills require explicit authorization", () => {
  const config = mergeConfig(base, {
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
      skillNames: ["*", "approved-skill"],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });

  assert.deepEqual(config.bots[0]?.skillNames, ["approved-skill"]);
});

test("adds an empty owner to older bot configs", () => {
  const config = mergeConfig(base, {
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
      skillNames: [],
      pendingReaction: "OnIt"
    } as never]
  });
  assert.equal(config.bots[0]?.ownerOpenId, "");
});

test("disables user-visible work progress for older bot configs", () => {
  const config = mergeConfig(base, {
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
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    } as never]
  });
  assert.equal(config.bots[0].showProgress, false);
});

test("normalizes long task notice settings on bot configs", () => {
  const config = mergeConfig(base, {
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
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: "",
      longTaskNoticeSeconds: 99999,
      longTaskNoticeText: "  还在处理  "
    } as never, {
      id: "bot-2",
      name: "Bot 2",
      enabled: true,
      cliPath: "",
      profile: "",
      appId: "cli_test",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: ["im.message.receive_v1"],
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: "",
      longTaskNoticeSeconds: -1,
      longTaskNoticeText: ""
    } as never]
  });
  assert.equal(config.bots[0].longTaskNoticeSeconds, 3600);
  assert.equal(config.bots[0].longTaskNoticeText, "还在处理");
  assert.equal(config.bots[1].longTaskNoticeSeconds, 0);
  assert.equal(config.bots[1].longTaskNoticeText, "这个问题还在处理中，我会继续完成并在结果出来后回复。");
});

test("normalizes custom OAuth scopes on bot configs", () => {
  const config = mergeConfig(base, {
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
      oauthScopes: ["drive:export:readonly docs:document:export", "drive:export:readonly"],
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });
  assert.deepEqual(config.bots[0].oauthScopes, ["drive:export:readonly", "docs:document:export"]);
});

test("detects running bots that share the same Feishu app id", () => {
  const config = mergeConfig(base, {
    bots: [{
      id: "bot-1",
      name: "Bot 1",
      enabled: true,
      provider: "lark",
      cliPath: "",
      profile: "",
      appId: "cli_same",
      appSecret: "secret-1",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: ["im.message.receive_v1"],
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }, {
      id: "bot-2",
      name: "Bot 2",
      enabled: true,
      provider: "lark",
      cliPath: "",
      profile: "",
      appId: " CLI_SAME ",
      appSecret: "secret-2",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: ["im.message.receive_v1"],
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });

  assert.equal(runningBotWithSameAppId(config.bots[1], config.bots, ["bot-1"])?.id, "bot-1");
  assert.equal(runningBotWithSameAppId(config.bots[1], config.bots, []), null);
});

test("normalizes im provider, connectors, and delivery routes", () => {
  const config = mergeConfig(base, {
    bots: [{
      id: "wecom-1",
      name: "WeCom 1",
      enabled: true,
      provider: "wecom",
      cliPath: "",
      profile: "100001",
      appId: "corp_id",
      appSecret: "secret",
      receiveIdentity: "bot",
      replyIdentity: "bot",
      eventTypes: [],
      providerOptions: {
        token: " tok ",
        eventCommand: " /usr/local/bin/wecom-event-bridge --bot wecom-1 "
      },
      connectors: {
        lark: {
          enabled: true,
          appId: "cli_lark",
          appSecret: "lark_secret",
          oauthScopes: ["drive:export:readonly search:docs:read"]
        }
      },
      deliveryRoutes: [{
        id: "route-1",
        enabled: true,
        provider: "lark",
        chatId: "oc_1",
        mode: "copy-final-reply"
      }],
      skillNames: [],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });

  const bot = config.bots[0]!;
  assert.equal(bot.provider, "wecom");
  assert.deepEqual(bot.eventTypes, ["message.receive"]);
  assert.deepEqual(bot.providerOptions, {
    token: "tok",
    eventCommand: "/usr/local/bin/wecom-event-bridge --bot wecom-1"
  });
  assert.equal(bot.connectors?.lark?.appId, "cli_lark");
  assert.deepEqual(bot.connectors?.lark?.oauthScopes, ["drive:export:readonly", "search:docs:read"]);
  assert.equal(bot.deliveryRoutes?.[0]?.provider, "lark");
  assert.equal(bot.deliveryRoutes?.[0]?.chatId, "oc_1");
});

test("adds a bounded max agent turns runtime config", () => {
  assert.equal(mergeConfig(base, {}).runtime.maxAgentTurns, 60);
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, maxAgentTurns: 500 } }).runtime.maxAgentTurns, 100);
  assert.equal(mergeConfig(base, { runtime: { ...base.runtime, maxAgentTurns: 1 } }).runtime.maxAgentTurns, 10);
});

test("defaults UI theme to system and normalizes invalid values", () => {
  assert.equal(mergeConfig(base, {}).ui.theme, "system");
  assert.equal(mergeConfig(base, { ui: { theme: "light" } }).ui.theme, "light");
  assert.equal(mergeConfig(base, { ui: { theme: "invalid" as never } }).ui.theme, "system");
});

test("normalizes bot capability refs without granting unknown fields", () => {
  const config = mergeConfig(base, {
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
      skillNames: [],
      capabilityRefs: [
        { kind: "app", id: "daily-report", enabled: true },
        { kind: "app", id: "daily-report", enabled: true },
        { kind: "unknown" as never, id: "bad", enabled: true }
      ],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });
  assert.deepEqual(config.bots[0]?.capabilityRefs, [{
    kind: "app",
    id: "daily-report",
    enabled: true,
    policy: {
      allowAgentUse: true,
      allowCommandUse: true,
      allowScheduledUse: true,
      requireOwnerApproval: false
    }
  }]);
});

test("normalizes bot command bindings and drops invalid entries", () => {
  const config = mergeConfig(base, {
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
      skillNames: [],
      commandBindings: [
        { name: "ppt", aliases: ["deck", "/slides", "new", "deck"], enabled: true, target: { type: "capability", capability: { kind: "skill", id: "pptx" } } },
        { name: "ppt", enabled: true, target: { type: "capability", capability: { kind: "app", id: "daily-report" } } },
        { name: "quality", enabled: true, target: { type: "capability", capability: { kind: "mcp", id: "quality-db" } } },
        { name: "qa", enabled: true, target: { type: "capability", capability: { kind: "suite", id: "manufacturing-qa" } } },
        { name: "rca", enabled: true, target: { type: "capability", capability: { kind: "workflow", id: "manufacturing-qa/root-cause-analysis" } } },
        { name: "help", enabled: true, target: { type: "capability", capability: { kind: "skill", id: "pptx" } } },
        { name: "bad name", enabled: true, target: { type: "capability", capability: { kind: "skill", id: "pptx" } } }
      ],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });
  assert.deepEqual(config.bots[0]?.commandBindings, [
    {
      name: "ppt",
      aliases: ["deck", "slides"],
      enabled: true,
      description: undefined,
      promptTemplate: undefined,
      target: { type: "capability", capability: { kind: "skill", id: "pptx" } }
    },
    {
      name: "quality",
      aliases: [],
      enabled: true,
      description: undefined,
      promptTemplate: undefined,
      target: { type: "capability", capability: { kind: "mcp", id: "quality-db" } }
    },
    {
      name: "qa",
      aliases: [],
      enabled: true,
      description: undefined,
      promptTemplate: undefined,
      target: { type: "capability", capability: { kind: "suite", id: "manufacturing-qa" } }
    },
    {
      name: "rca",
      aliases: [],
      enabled: true,
      description: undefined,
      promptTemplate: undefined,
      target: { type: "capability", capability: { kind: "workflow", id: "manufacturing-qa/root-cause-analysis" } }
    }
  ]);
});

test("normalizes scheduled tasks and drops invalid entries", () => {
  const config = mergeConfig(base, {
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
      skillNames: [],
      scheduledTasks: [
        {
          id: "task-1",
          botId: "other",
          enabled: true,
          name: "日报",
          schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "09:30" },
          target: { type: "command", commandName: "report", prompt: "生成日报" },
          delivery: { type: "chat", chatId: "oc_123" }
        },
        {
          id: "task-2",
          botId: "bot-1",
          enabled: true,
          name: "bad",
          schedule: { type: "weekly", timezone: "Asia/Shanghai", timeOfDay: "09:30", weekdays: [] },
          target: { type: "command", commandName: "report", prompt: "生成日报" },
          delivery: { type: "chat", chatId: "oc_123" }
        },
        {
          id: "task-3",
          botId: "bot-1",
          enabled: true,
          name: "套件任务",
          schedule: { type: "interval", timezone: "Asia/Shanghai", everyMinutes: 30 },
          target: { type: "capability", capability: { kind: "suite", id: "manufacturing-qa" }, prompt: "按套件流程执行" },
          delivery: { type: "chat", chatId: "oc_456" }
        },
        {
          id: "task-4",
          botId: "bot-1",
          enabled: true,
          name: "工作流任务",
          schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "11:00" },
          target: { type: "capability", capability: { kind: "workflow", id: "manufacturing-qa/root-cause-analysis" }, prompt: "分析当日异常" },
          delivery: { type: "chat", chatId: "oc_789" }
        },
        {
          id: "task-mcp",
          botId: "bot-1",
          enabled: true,
          name: "MCP 巡检",
          schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "10:00" },
          target: { type: "capability", capability: { kind: "mcp", id: "quality-db" }, prompt: "检查质量数据" },
          delivery: { type: "chat", chatId: "oc_mcp" }
        },
        {
          id: "task-5",
          botId: "bot-1",
          enabled: true,
          name: "工作日巡检",
          schedule: { type: "cron", timezone: "Asia/Shanghai", cronExpression: "15   9 * * 1-5" },
          target: { type: "agent", prompt: "执行工作日巡检" },
          delivery: { type: "chat", chatId: "oc_999" },
          retry: { maxRetries: 3, delayMinutes: 15 },
          failureCount: 2,
          retryAt: "2026-06-16T02:15:00.000Z",
          pausedReason: "等待人工处理"
        },
        {
          id: "task-6",
          botId: "bot-1",
          enabled: true,
          name: "bad cron",
          schedule: { type: "cron", timezone: "Asia/Shanghai", cronExpression: "60 9 * * *" },
          target: { type: "agent", prompt: "不会保留" },
          delivery: { type: "chat", chatId: "oc_bad" }
        }
      ],
      pendingReaction: "OnIt",
      ownerOpenId: ""
    }]
  });
  assert.deepEqual(config.bots[0]?.scheduledTasks, [
    {
      id: "task-1",
      botId: "bot-1",
      enabled: true,
      name: "日报",
      schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "09:30" },
      target: { type: "command", commandName: "report", prompt: "生成日报" },
      delivery: { type: "chat", chatId: "oc_123", replyIdentity: undefined }
    },
    {
      id: "task-3",
      botId: "bot-1",
      enabled: true,
      name: "套件任务",
      schedule: { type: "interval", timezone: "Asia/Shanghai", everyMinutes: 30 },
      target: { type: "capability", capability: { kind: "suite", id: "manufacturing-qa" }, prompt: "按套件流程执行" },
      delivery: { type: "chat", chatId: "oc_456", replyIdentity: undefined }
    },
    {
      id: "task-4",
      botId: "bot-1",
      enabled: true,
      name: "工作流任务",
      schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "11:00" },
      target: { type: "capability", capability: { kind: "workflow", id: "manufacturing-qa/root-cause-analysis" }, prompt: "分析当日异常" },
      delivery: { type: "chat", chatId: "oc_789", replyIdentity: undefined }
    },
    {
      id: "task-mcp",
      botId: "bot-1",
      enabled: true,
      name: "MCP 巡检",
      schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "10:00" },
      target: { type: "capability", capability: { kind: "mcp", id: "quality-db" }, prompt: "检查质量数据" },
      delivery: { type: "chat", chatId: "oc_mcp", replyIdentity: undefined }
    },
    {
      id: "task-5",
      botId: "bot-1",
      enabled: true,
      name: "工作日巡检",
      schedule: { type: "cron", timezone: "Asia/Shanghai", cronExpression: "15 9 * * 1-5" },
      target: { type: "agent", prompt: "执行工作日巡检" },
      delivery: { type: "chat", chatId: "oc_999", replyIdentity: undefined },
      retry: { maxRetries: 3, delayMinutes: 15 }
    }
  ]);
});

test("normalizes MCP server config entries", () => {
  const config = mergeConfig(base, {
    mcpServers: [
      {
        id: "quality-db",
        name: "质量库",
        enabled: true,
        transport: "stdio",
        command: "node",
        args: ["dist/server.js"],
        env: [{ name: "TOKEN", value: "abc", secret: true }],
        timeoutMs: 5000,
        alwaysLoad: true
      },
      {
        id: "quality-db",
        name: "dup",
        enabled: true,
        transport: "stdio",
        command: "bad",
        args: [],
        env: []
      }
    ]
  });
  assert.deepEqual(config.mcpServers, [{
    id: "quality-db",
    name: "质量库",
    enabled: true,
    transport: "stdio",
    command: "node",
    args: ["dist/server.js"],
    env: [{ name: "TOKEN", value: "abc", secret: true }],
    cwd: undefined,
    description: undefined,
    timeoutMs: 5000,
    alwaysLoad: true
  }]);
});

test("normalizes HTTP MCP server config entries as placeholders", () => {
  const config = mergeConfig(base, {
    mcpServers: [{
      id: "remote-mcp",
      name: "Remote MCP",
      enabled: true,
      transport: "http",
      url: " https://example.com/mcp ",
      command: "",
      args: ["ignored"],
      env: []
    }]
  });

  assert.equal(config.mcpServers[0]?.transport, "http");
  assert.equal(config.mcpServers[0]?.url, "https://example.com/mcp");
  assert.equal(config.mcpServers[0]?.command, "");
});

test("keeps incomplete MCP server drafts for UI diagnostics", () => {
  const config = mergeConfig(base, {
    mcpServers: [{
      id: "draft-mcp",
      name: "Draft MCP",
      enabled: true,
      transport: "stdio",
      command: "",
      args: [],
      env: []
    }, {
      id: "draft-http",
      name: "Draft HTTP",
      enabled: true,
      transport: "http",
      command: "",
      args: [],
      env: []
    }]
  });

  assert.equal(config.mcpServers.length, 2);
  assert.equal(config.mcpServers[0]?.id, "draft-mcp");
  assert.equal(config.mcpServers[0]?.command, "");
  assert.equal(config.mcpServers[1]?.id, "draft-http");
  assert.equal(config.mcpServers[1]?.url, undefined);
});
