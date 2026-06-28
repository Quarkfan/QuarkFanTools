import "./style.css";
import logoUrl from "../logo.png";
import type { AppConfig, AppInfo, BotConfig, CapabilityAuditReport, CapabilityAuditSummary, CustomAppPreview, LogEntry, McpServerDiagnostic, PlatformConnectorDiagnostic, RuntimeSnapshot, ScheduledTask, ScheduledTaskRunSummary, SkillPreview, StorageSessionDetail, StorageStats, SuitePreview, WeComChatListResult } from "../electron/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: RuntimeSnapshot;
let logs: LogEntry[] = [];
let storage: StorageStats;
let scheduledRuns: ScheduledTaskRunSummary[] = [];
let mcpDiagnostics: McpServerDiagnostic[] = [];
let platformDiagnostics: PlatformConnectorDiagnostic[] = [];
let capabilityAudit: CapabilityAuditReport = { summaries: [], recent: [] };
let applicationInfo: AppInfo;
let activeView: "console" | "skills" | "capabilities" | "scheduled" | "config" | "storage" = "console";
let selectedBotId = "";
let logLevel: "all" | LogEntry["level"] = "all";
let runHistoryBotFilter = "all";
let runHistoryStatusFilter: "all" | ScheduledTaskRunSummary["status"] = "all";
let cacheBotFilter = "all";
let cacheSourceFilter = "all";
let showReleaseNotes = false;
type MarketSource = "all" | "local" | "market" | "builtin" | "unused";
let marketSource: MarketSource = "all";
let marketSearch = "";
let activeCapabilitySection: "overview" | "diagnostics" | "mcp" | "suites" | "apps" | "audit" = "overview";
let activeConsoleSection: "bots" | "logs" = "bots";
let activeConfigSection: "model" | "customApps" | "market" | "mcp" | "bots" = "model";
let activeStorageSection: "cleanup" | "sessions" | "cache" | "artifacts" | "runs" = "cleanup";
let activeScheduledSection: "tasks" | "runs" = "tasks";
type BotEditorSection = "basic" | "platform" | "delivery" | "skills" | "capabilities" | "commands" | "scheduled";
let activeBotEditorSection: BotEditorSection = "basic";
let preview: { title: string; body?: string; html?: string } | null = null;
let editingBotId = "";
let editingScheduledTaskId = "";
const draftScheduledTaskIds = new Set<string>();
let botEditorScrollTop = 0;
let helpTopicKey = "";
let showManual = false;
let sessionDetailForPreview: StorageSessionDetail | null = null;
let wecomInitStatus: Record<string, { level: LogEntry["level"]; text: string }> = {};
let wecomChatListStatus: Record<string, { level: LogEntry["level"]; text: string; result?: WeComChatListResult }> = {};
const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const WECOM_PROVIDER_CLOSED_MESSAGE = "企业微信 Provider 因官方能力限制暂时封闭。当前版本不会启动企业微信监听、轮询、聊天列表获取或结果投递；已填写配置会保留，后续方案明确后再开放。";

function appendLocalLog(level: LogEntry["level"], message: string, detail?: string, botId?: string): void {
  logs = [...logs.slice(-499), {
    id: `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toISOString(),
    level,
    message,
    detail,
    botId
  }];
}

const helpTopics: Record<string, { title: string; body: string }> = {
  providerName: { title: "Provider 名称", body: "仅用于界面展示，方便区分当前配置的模型服务商。" },
  baseUrl: { title: "Claude Base URL", body: "兼容 Claude Messages API 的服务地址。当前 Agent SDK 需要 Claude/Anthropic 兼容接口和工具调用能力。" },
  model: { title: "模型", body: "发送给模型服务的模型名。复杂 Skill、飞书资料检索和多模态任务需要选择支持工具调用的模型。" },
  apiKey: { title: "API Key", body: "模型服务认证密钥，仅保存在本机配置文件，不提交到 Git。" },
  maxConcurrentTasks: { title: "最大并发任务数", body: "限制不同会话同时运行的 Agent 数量。同一会话始终串行处理，避免上下文交叉。" },
  maxAgentTurns: { title: "单次 Agent 最大步数", body: "限制一次消息处理中 Agent 可执行的工具调用轮数。复杂检索可适当调高，范围 10-100。" },
  customAppArtifacts: { title: "自定义应用运行产物", body: "自定义应用执行时写入当前会话 workspace 的截图、临时 JSON 和调试文件。清理只删除运行产物，不删除自定义应用本体、Bot 配置或授权。" },
  customAppReplyProcessing: { title: "自定义应用回复后处理", body: "每个自定义应用可以分别配置原样返回或总结后返回。启用总结后，主进程会用当前模型配置对该应用输出做一次无工具文本总结，API Key 不会下放给自定义应用。" },
  multimodalEnabled: { title: "多模态视觉能力", body: "开启后图片消息和 PowerPoint 预览可作为视觉输入交给模型；关闭后只处理文本内容。" },
  uiTheme: { title: "界面主题", body: "支持跟随系统、浅色和深色。跟随系统时会根据 macOS 当前外观自动切换。" },
  marketEnabled: { title: "启用技能市场", body: "启用后可从 HTTPS Git 仓库同步 Skill。同步后的 Skill 默认不授权给任何 Bot。" },
  marketRepositoryUrl: { title: "HTTPS Git 仓库", body: "Skill 市场仓库地址。当前只支持 HTTPS，不依赖系统 Git 或 SSH Key。" },
  marketBranch: { title: "分支", body: "同步 Skill 市场时使用的 Git 分支。" },
  marketToken: { title: "访问 Token", body: "私有 Skill 市场仓库的访问 Token。仅保存在本机配置中。" },
  mcpServers: { title: "MCP 服务", body: "MCP 服务是全局配置的工具能力。当前 stdio 可进入 Agent、命令和定时任务；HTTP/SSE 只保存 URL 并显示占位诊断，真实运行时接入后再开放。" },
  mcpTransport: { title: "MCP 传输方式", body: "stdio 会启动本机命令并可做协议探测；HTTP/SSE 当前先作为配置占位保存和诊断，运行时注入与真实探测待端到端验证后接入。" },
  mcpCommand: { title: "MCP 启动命令", body: "stdio MCP 的本机启动命令，例如 node、python 或绝对路径。应用会在 cwd 和 PATH 中解析命令，找不到时在能力页显示 ERROR。" },
  mcpUrl: { title: "HTTP/SSE URL", body: "HTTP 或 SSE MCP 的服务地址。当前版本只保存配置并提示占位诊断，不会注入 Claude Agent SDK。" },
  mcpEnv: { title: "MCP 环境变量", body: "每行一个 NAME=value。空值会被诊断为风险；不要把无关 Token 放进不需要它的 MCP。" },
  botList: { title: "Bot 列表", body: "每个 Bot 拥有独立 IM CLI 状态、Claude home、会话 workspace 和 Skill 授权。点击行可编辑详细配置。" },
  botName: { title: "机器人名称", body: "界面和日志中展示的名称，不影响飞书开放平台配置。" },
  botEnabled: { title: "启用", body: "停用后该 Bot 不会启动监听，也不会作为可运行机器人计入配置检查。" },
  imProvider: { title: "消息平台", body: "控制该 Bot 从哪个 IM 平台接收消息并默认回复。当前可用飞书；企业微信因官方能力限制暂时封闭，钉钉是建设中预留项，二者都不能启动监听。飞书知识库、文件和跨平台投递通过连接器与投递路由单独配置。" },
  wecomEventCommand: { title: "企业微信事件桥命令", body: "企业微信 Provider 当前暂时封闭，此配置只保留历史值，不会启动监听。后续如重新开放，会优先采用稳定的官方回调或明确可维护的事件桥方案。" },
  wecomPollChat: { title: "企业微信轮询会话", body: "企业微信轮询能力当前暂时封闭。已填写的 Chat ID 会保留，但当前版本不会调用 get_message 拉取消息。" },
  wecomPollWindow: { title: "企业微信轮询窗口", body: "企业微信轮询能力当前暂时封闭。该窗口配置只保留历史值，当前版本不会触发轮询。" },
  appId: { title: "App / Bot ID", body: "当前消息平台的应用或机器人 ID。飞书填写 App ID；企业微信填写智能机器人 Bot ID，不是企业 Corp ID。" },
  appSecret: { title: "App / Bot Secret", body: "当前消息平台的应用或机器人密钥。企业微信填写智能机器人 Bot Secret，仅保存在本机配置中。" },
  receiveIdentity: { title: "接收身份", body: "飞书事件监听使用的身份。一般使用 Bot；只有明确需要用户态事件时再切换。" },
  replyIdentity: { title: "回复身份", body: "机器人回复消息、表情和文件时使用的身份。Bot 态通常更稳定。" },
  pendingReaction: { title: "处理中表情", body: "收到消息后添加到原消息上的反应名称，任务结束后会移除，用于替代“正在查询”文本。" },
  ownerOpenId: { title: "Owner 飞书 open_id", body: "Agent 无法解决或需要人工处理时，会向该用户私聊发送处理卡片。" },
  longTaskNoticeSeconds: { title: "长任务提示时间", body: "单次消息处理超过该秒数仍未完成时，会先自动回复一段提示。填 0 表示关闭，开启时最终结果仍会继续正常回复。" },
  longTaskNoticeText: { title: "长任务提示文案", body: "长任务超过提示时间后自动回复给提问人的文案。只发送一次，不替代最终答案。" },
  oauthScopes: { title: "用户态 OAuth 额外权限", body: "默认会申请 search:docs:read。这里填写额外 scope 后，保存并重新点击用户态 OAuth 才会生效；飞书开放平台也必须先开通对应权限。" },
  larkConnector: { title: "飞书知识连接器", body: "当消息入口不是飞书时，仍可配置飞书连接器用于查找飞书文档、云盘文件、云 PPT 和向飞书群投递结果。未配置时微信 Bot 不会获得飞书资料能力。" },
  deliveryRoutes: { title: "结果投递路由", body: "最终回复先回到原消息平台；投递路由会把同一份最终结果复制发送到配置的目标平台 chat。跨平台投递需要对应 connector 可用。" },
  capabilityPolicy: { title: "能力运行策略", body: "控制已授权能力能否被 Agent 自主使用、命令调用、定时任务调用，或是否需要 Owner 审批。授权和运行策略是两层边界：勾选只表示可见，策略决定怎么用。" },
  showProgress: { title: "向用户展示工作过程", body: "开启后向用户展示工具调用、检索和重试等可观察进度，不展示模型隐藏推理或敏感参数。" },
  skillAccess: { title: "允许访问的 Skills", body: "Bot 只能看到明确勾选的 Skills。新增或导入的 Skill 默认不授权，避免能力范围意外扩大。" },
  mcpAccess: { title: "允许访问的 MCP", body: "MCP 服务是全局定义、Bot 局部授权的工具能力。未授权的 MCP 不会进入当前 Bot 的 Claude Agent 上下文。" },
  customAppAccess: { title: "允许访问的自定义应用", body: "自定义应用通过 app.json 导入，并作为 Bot 可治理能力授权。导入不等于授权；只有勾选后，后续命令或定时任务才能调用。当前 node 和受控 executable 可执行；webview、mcp-adapter、workflow 入口会显示建设中，不进入命令或定时目标。" },
  suiteAccess: { title: "允许访问的套件", body: "套件用于面向角色或行业组合 Skills、自定义应用、MCP 和工作流说明。当前支持导入、预览、Bot 挂载授权，并可作为命令目标向 Agent 注入套件上下文。" },
  commandBindings: { title: "命令映射", body: "将 /xxx 映射到某个 Skill、套件、Workflow 或自定义应用。保留命令 /new、/continue、/owner、/help 不能占用；命令名和别名建议使用小写字母、数字、短横线或下划线。" },
  scheduledTasks: { title: "定时任务", body: "定时任务属于单个 Bot，当前支持 interval、daily、weekly 和 cron 四种计划类型，目标可选 agent、command 或 capability，并把结果投递到指定 chat_id。cron 使用 5 段表达式：分钟 小时 日 月 周，例如 15 9 * * 1-5 表示工作日 09:15。可配置失败重试；超过上限后任务会暂停自动排期并显示暂停原因。" }
};

function closeReleaseNotes(): void {
  showReleaseNotes = false;
  render();
}

function closeManual(): void {
  showManual = false;
  render();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseScopes(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}

function configured(config: AppConfig): boolean {
  return Boolean(
    config.model.baseUrl &&
    config.model.model &&
    config.model.apiKey &&
    config.bots.some((bot) => bot.enabled && (bot.provider ?? "lark") !== "dingtalk" && bot.appId && bot.appSecret)
  );
}

function botCanStart(bot: BotConfig): boolean {
  return botStartBlockReason(bot) === "";
}

function botStartBlockReason(bot: BotConfig): string {
  if (!bot.enabled) return "Bot 已停用";
  if ((bot.provider ?? "lark") === "dingtalk") return "钉钉 Provider 建设中，当前不能启动监听";
  if (!bot.appId.trim()) return (bot.provider ?? "lark") === "wecom" ? "未配置企业微信 Bot ID" : "未配置 App ID";
  if (!bot.appSecret.trim()) return (bot.provider ?? "lark") === "wecom" ? "未配置企业微信 Bot Secret" : "未配置 App Secret";
  if (!snapshot.config.model.baseUrl) return "未配置 Claude Base URL";
  if (!snapshot.config.model.model) return "未配置模型名称";
  if (!snapshot.config.model.apiKey) return "未配置 API Key";
  return "";
}

function statusDot(ok: boolean): string {
  return `<span class="status-dot ${ok ? "ok" : ""}"></span>`;
}

function helpButton(topic: string): string {
  return `<button type="button" class="help-button" data-help="${escapeHtml(topic)}" aria-label="查看配置说明">?</button>`;
}

function pageTabs<T extends string>(items: Array<{ id: T; label: string; meta?: string }>, active: T, attr: string): string {
  return `<nav class="page-tabs" aria-label="页面分组">${items.map((item) => `
    <button type="button" class="${active === item.id ? "active" : ""}" ${attr}="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.label)}</span>${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
    </button>`).join("")}</nav>`;
}

function applyTheme(config: AppConfig): void {
  const preference = config.ui.theme;
  const effective = preference === "system"
    ? (systemThemeMedia.matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = effective;
}

function render(): void {
  applyTheme(snapshot.config);
  const isConfigured = configured(snapshot.config);
  const enabledBotCount = snapshot.config.bots.filter((bot) => bot.enabled).length;
  const onlineBotCount = snapshot.connectedBotIds.length;
  const botStatus = enabledBotCount > 0 ? `BOTS ${onlineBotCount}/${enabledBotCount} ONLINE` : "NO BOT ENABLED";
  app.innerHTML = `
    <div class="window-drag-strip" title="拖动窗口"><span>QUARKFANTOOLS</span></div>
    <aside class="rail">
      <button type="button" class="brand brand-button" id="show-manual" title="打开使用手册">
        <span class="brand-lockup">
          <img class="brand-logo" src="${logoUrl}" alt="QuarkfanTools logo" />
          <span class="brand-wordmark"><span class="brand-line">QUARK<span class="brand-accent">FAN</span></span><span class="brand-line">TOOLS</span></span>
        </span>
      </button>
      <div class="rail-label">LOCAL SKILL AGENT</div>
      <nav>
        <button class="${activeView === "console" ? "active" : ""}" data-view="console">运行台</button>
        <button class="${activeView === "skills" ? "active" : ""}" data-view="skills">技能市场</button>
        <button class="${activeView === "capabilities" ? "active" : ""}" data-view="capabilities">能力</button>
        <button class="${activeView === "scheduled" ? "active" : ""}" data-view="scheduled">定时任务</button>
        <button class="${activeView === "config" ? "active" : ""}" data-view="config">配置</button>
        <button class="${activeView === "storage" ? "active" : ""}" data-view="storage">存储管理</button>
      </nav>
      <div class="rail-foot">
        <div>${statusDot(onlineBotCount > 0)}${botStatus}</div>
        <small>${snapshot.runningBotIds.length} listening / ${snapshot.queuedTasks} queued</small>
        <button class="version-button" id="show-release-notes">VERSION ${escapeHtml(applicationInfo.version)}</button>
      </div>
    </aside>
    <main>
      <header>
        <div>
          <p class="eyebrow">MACOS / FEISHU / CLAUDE</p>
          <h1>${activeView === "console" ? "运行控制台" : activeView === "skills" ? "本地技能市场" : activeView === "capabilities" ? "Bot 能力治理" : activeView === "scheduled" ? "定时任务中心" : activeView === "config" ? "机器人与模型配置" : "会话存储管理"}</h1>
        </div>
        <div class="actions">
          ${activeView === "skills" ? `<button class="ghost" id="import-skill">导入 Skill</button>` : ""}
          ${activeView === "capabilities" ? `<button class="ghost" id="import-suite">导入套件</button><button class="ghost" id="import-custom-app">导入自定义应用</button>` : ""}
        </div>
      </header>
      ${!isConfigured ? `<div class="notice">至少配置一个启用的 IM 机器人，并填写 Claude 兼容模型连接信息。</div>` : ""}
      ${activeView === "console" ? renderConsole() : activeView === "skills" ? renderSkills() : activeView === "capabilities" ? renderCapabilities() : activeView === "scheduled" ? renderScheduledCenter() : activeView === "config" ? renderConfig() : renderStorage()}
    </main>
    ${showReleaseNotes ? renderReleaseNotes() : ""}
    ${preview ? renderPreview() : ""}
    ${editingBotId ? renderBotEditor() : ""}
    ${helpTopicKey ? renderHelpModal() : ""}
    ${showManual ? renderManual() : ""}
  `;
  bindEvents();
  filterMarketSkills();
  if (editingBotId) {
    requestAnimationFrame(() => {
      const body = document.querySelector<HTMLElement>(".bot-editor-body");
      if (body) body.scrollTop = botEditorScrollTop;
    });
  }
}

function skillSourceLabel(source: RuntimeSnapshot["skills"][number]["source"]): string {
  return source === "local" ? "本地导入" : source === "market" ? "Git 市场" : "应用内置";
}

function capabilitySourceLabel(source: "local" | "builtin"): string {
  return source === "builtin" ? "内置模板" : "本地导入";
}

function imProviderLabel(provider: BotConfig["provider"]): string {
  if (provider === "wecom") return "企业微信";
  if (provider === "dingtalk") return "钉钉（建设中）";
  return "飞书";
}

function botHasCapability(bot: BotConfig, kind: string, id: string): boolean {
  return Boolean(bot.capabilityRefs?.some((ref) => ref.kind === kind && ref.id === id && ref.enabled));
}

function botCapabilityPolicy(bot: BotConfig, kind: string, id: string): NonNullable<BotConfig["capabilityRefs"]>[number]["policy"] | undefined {
  return bot.capabilityRefs?.find((ref) => ref.kind === kind && ref.id === id && ref.enabled)?.policy;
}

function customAppExecutable(customApp: RuntimeSnapshot["customApps"][number]): boolean {
  return customApp.entry.type === "node" || customApp.entry.type === "executable";
}

function customAppAvailabilityLabel(customApp: RuntimeSnapshot["customApps"][number]): string {
  if (customApp.entry.type === "node") return "可执行";
  if (customApp.entry.type === "executable") return "高风险可执行";
  if (customApp.entry.type === "webview") return "UI 建设中";
  if (customApp.entry.type === "mcp-adapter") return "MCP 适配建设中";
  if (customApp.entry.type === "workflow") return "请使用套件 Workflow";
  return "建设中";
}

function commandTargetOptions(bot: BotConfig): Array<{ label: string; value: string }> {
  return [
    ...snapshot.skills
      .filter((skill) => bot.skillNames.includes(skill.name))
      .map((skill) => ({ label: `Skill / ${skill.name}`, value: `skill:${skill.name}` })),
    ...snapshot.config.mcpServers
      .filter((server) => server.enabled && server.transport === "stdio" && server.command.trim() && botHasCapability(bot, "mcp", server.id))
      .map((server) => ({ label: `MCP / ${server.name}`, value: `mcp:${server.id}` })),
    ...snapshot.suites
      .filter((suite) => botHasCapability(bot, "suite", suite.id))
      .map((suite) => ({ label: `Suite / ${suite.name}`, value: `suite:${suite.id}` })),
    ...snapshot.suites
      .filter((suite) => botHasCapability(bot, "suite", suite.id))
      .flatMap((suite) => suite.workflows.map((workflow) => ({
        label: `Workflow / ${suite.name} / ${workflow.name}`,
        value: `workflow:${suite.id}/${workflow.id}`
      }))),
    ...snapshot.customApps
      .filter((customApp) => botHasCapability(bot, "app", customApp.id) && customApp.capabilities.commandCallable && customAppExecutable(customApp))
      .map((customApp) => ({ label: `App / ${customApp.name}`, value: `app:${customApp.id}` }))
  ];
}

function scheduledCapabilityOptions(bot: BotConfig): Array<{ label: string; value: string }> {
  return [
    ...snapshot.skills
      .filter((skill) => bot.skillNames.includes(skill.name))
      .map((skill) => ({ label: `Skill / ${skill.name}`, value: `skill:${skill.name}` })),
    ...snapshot.config.mcpServers
      .filter((server) => server.enabled && server.transport === "stdio" && server.command.trim() && botHasCapability(bot, "mcp", server.id))
      .map((server) => ({ label: `MCP / ${server.name}`, value: `mcp:${server.id}` })),
    ...snapshot.suites
      .filter((suite) => botHasCapability(bot, "suite", suite.id))
      .map((suite) => ({ label: `Suite / ${suite.name}`, value: `suite:${suite.id}` })),
    ...snapshot.suites
      .filter((suite) => botHasCapability(bot, "suite", suite.id))
      .flatMap((suite) => suite.workflows.map((workflow) => ({
        label: `Workflow / ${suite.name} / ${workflow.name}`,
        value: `workflow:${suite.id}/${workflow.id}`
      }))),
    ...snapshot.customApps
      .filter((customApp) => botHasCapability(bot, "app", customApp.id) && customApp.capabilities.scheduledCallable && customAppExecutable(customApp))
      .map((customApp) => ({ label: `App / ${customApp.name}`, value: `app:${customApp.id}` }))
  ];
}

function commandBindingConflicts(bot: BotConfig): string[] {
  const reserved = new Set(["new", "continue", "owner", "help"]);
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const binding of bot.commandBindings ?? []) {
    const tokens = [binding.name, ...(binding.aliases ?? [])].map((item) => item.trim().toLowerCase()).filter(Boolean);
    for (const token of tokens) {
      if (reserved.has(token)) {
        conflicts.push(`/${token} 是系统保留命令，不能作为命令名或别名。`);
        continue;
      }
      const previous = seen.get(token);
      if (previous) {
        conflicts.push(`/${token} 同时出现在 ${previous} 和 /${binding.name}，保存时后者可能不可用。`);
        continue;
      }
      seen.set(token, `/${binding.name}`);
    }
  }
  return [...new Set(conflicts)];
}

function policyPresetValue(policy: NonNullable<BotConfig["capabilityRefs"]>[number]["policy"] | undefined): string {
  if (policy?.requireOwnerApproval) return "approval";
  if (policy?.allowAgentUse === false && policy?.allowCommandUse === false && policy?.allowScheduledUse === false) return "blocked";
  if (policy?.allowAgentUse === true && policy?.allowCommandUse === false && policy?.allowScheduledUse === false) return "agent";
  if (policy?.allowAgentUse === true && policy?.allowCommandUse === true && policy?.allowScheduledUse === false) return "agent-command";
  if (policy?.allowAgentUse === true && policy?.allowCommandUse === false && policy?.allowScheduledUse === true) return "agent-scheduled";
  return "all";
}

function policyFromPreset(preset: string): NonNullable<NonNullable<BotConfig["capabilityRefs"]>[number]["policy"]> {
  if (preset === "approval") return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true, requireOwnerApproval: true };
  if (preset === "blocked") return { allowAgentUse: false, allowCommandUse: false, allowScheduledUse: false, requireOwnerApproval: false };
  if (preset === "agent") return { allowAgentUse: true, allowCommandUse: false, allowScheduledUse: false, requireOwnerApproval: false };
  if (preset === "agent-command") return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: false, requireOwnerApproval: false };
  if (preset === "agent-scheduled") return { allowAgentUse: true, allowCommandUse: false, allowScheduledUse: true, requireOwnerApproval: false };
  return { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true, requireOwnerApproval: false };
}

function capabilityPolicySelect(bot: BotConfig, kind: "mcp" | "app" | "suite", id: string): string {
  const value = policyPresetValue(botCapabilityPolicy(bot, kind, id));
  return `<span class="capability-policy-control">${helpButton("capabilityPolicy")}<select class="capability-policy-select" data-edit-bot-capability-policy="${kind}:${escapeHtml(id)}">
    <option value="all" ${value === "all" ? "selected" : ""}>Agent + 命令 + 定时</option>
    <option value="agent" ${value === "agent" ? "selected" : ""}>仅 Agent</option>
    <option value="agent-command" ${value === "agent-command" ? "selected" : ""}>Agent + 命令</option>
    <option value="agent-scheduled" ${value === "agent-scheduled" ? "selected" : ""}>Agent + 定时</option>
    <option value="approval" ${value === "approval" ? "selected" : ""}>使用前 Owner 审批</option>
    <option value="blocked" ${value === "blocked" ? "selected" : ""}>已授权但禁用运行</option>
  </select></span>`;
}

function scheduledCommandOptions(bot: BotConfig): string[] {
  return (bot.commandBindings ?? []).filter((binding) => binding.enabled).map((binding) => binding.name);
}

function appInUseBy(appId: string): string {
  return snapshot.config.bots
    .filter((bot) => botHasCapability(bot, "app", appId))
    .map((bot) => bot.name)
    .join("、");
}

function suiteInUseBy(suiteId: string): string {
  return snapshot.config.bots
    .filter((bot) => botHasCapability(bot, "suite", suiteId))
    .map((bot) => bot.name)
    .join("、");
}

function mcpInUseBy(mcpId: string): string {
  return snapshot.config.bots
    .filter((bot) => botHasCapability(bot, "mcp", mcpId))
    .map((bot) => bot.name)
    .join("、");
}

function mcpDiagnostic(serverId: string): McpServerDiagnostic | undefined {
  return mcpDiagnostics.find((item) => item.id === serverId);
}

function protocolFailureText(protocol: NonNullable<McpServerDiagnostic["protocol"]>): string {
  return [
    protocol.error || "未知错误",
    protocol.exitCode !== undefined ? `exit=${protocol.exitCode ?? ""}` : "",
    protocol.signal ? `signal=${protocol.signal}` : "",
    protocol.stderrTail ? `stderr=${protocol.stderrTail}` : ""
  ].filter(Boolean).join(" / ");
}

function lastMcpProbeText(diagnostic: McpServerDiagnostic): string {
  if (!diagnostic.lastProbe) return "";
  const probe = diagnostic.lastProbe;
  const parts = [
    new Date(probe.probedAt).toLocaleString(),
    probe.status === "ok" ? "OK" : "FAILED",
    probe.durationMs !== undefined ? `${probe.durationMs}ms` : "",
    probe.status === "ok" ? `tools: ${probe.tools.join("、") || "无"}` : probe.error || probe.stderrTail || ""
  ].filter(Boolean);
  return parts.join(" / ");
}

function diagnosticLabel(status: McpServerDiagnostic["status"]): string {
  return status === "ok" ? "OK" : status === "warn" ? "WARN" : "ERROR";
}

function riskLabel(risk: NonNullable<RuntimeSnapshot["capabilityDiagnostics"]>[number]["risk"]): string {
  return risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险";
}

function capabilityDiagnosticKindLabel(kind: NonNullable<RuntimeSnapshot["capabilityDiagnostics"]>[number]["kind"]): string {
  return kind === "app" ? "自定义应用" : kind === "suite" ? "套件" : "Workflow";
}

function auditStatusLabel(status: CapabilityAuditSummary["lastStatus"]): string {
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  if (status === "blocked") return "阻断";
  return "待审批";
}

function auditTriggerLabel(trigger: CapabilityAuditSummary["trigger"]): string {
  return trigger === "scheduled" ? "定时" : trigger === "agent" ? "Agent" : "命令";
}

function capabilityPolicyText(policy: NonNullable<BotConfig["capabilityRefs"]>[number]["policy"] | undefined): string {
  const values = [
    policy?.allowAgentUse === false ? "Agent 禁用" : "Agent 可用",
    policy?.allowCommandUse === false ? "命令禁用" : "命令可用",
    policy?.allowScheduledUse === false ? "定时禁用" : "定时可用",
    policy?.requireOwnerApproval ? "需 Owner 审批" : ""
  ].filter(Boolean);
  return values.join(" / ");
}

function botGovernanceRefs(bot: BotConfig): NonNullable<BotConfig["capabilityRefs"]> {
  const refs = [...(bot.capabilityRefs ?? [])];
  const seen = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
  for (const skillName of bot.skillNames) {
    const key = `skill:${skillName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      kind: "skill",
      id: skillName,
      enabled: true,
      policy: { allowAgentUse: true, allowCommandUse: true, allowScheduledUse: true }
    });
  }
  return refs;
}

function auditSummaryFor(botId: string, kind: string, id: string): CapabilityAuditSummary[] {
  return capabilityAudit.summaries.filter((summary) => summary.botId === botId && summary.capability.kind === kind && summary.capability.id === id);
}

function resourceOpenButton(kind: "skill" | "app" | "suite", id: string): string {
  return `<button type="button" class="ghost resource-open-folder" data-resource-kind="${kind}" data-resource-id="${escapeHtml(id)}">打开目录</button>`;
}

type CapabilitySection = typeof activeCapabilitySection;

function capabilityHealthCounts(): { ok: number; warn: number; error: number } {
  const statuses = [
    ...snapshot.capabilityDiagnostics.map((item) => item.status),
    ...platformDiagnostics.map((item) => item.status),
    ...mcpDiagnostics.map((item) => item.status)
  ];
  return {
    ok: statuses.filter((status) => status === "ok").length,
    warn: statuses.filter((status) => status === "warn").length,
    error: statuses.filter((status) => status === "error").length
  };
}

function renderCapabilitySectionNav(counts: {
  mountedRefs: number;
  diagnosticIssues: number;
  mcpCount: number;
  suiteCount: number;
  appCount: number;
  auditCount: number;
}): string {
  const items: Array<{ id: CapabilitySection; title: string; meta: string; body: string }> = [
    { id: "overview", title: "治理总览", meta: `${counts.mountedRefs} refs`, body: "先看 Bot 授权、policy 和整体使用范围。" },
    { id: "diagnostics", title: "诊断与排障", meta: `${counts.diagnosticIssues} issues`, body: "集中处理 ERROR/WARN、连接器缺口和建设中能力。" },
    { id: "mcp", title: "MCP 服务", meta: `${counts.mcpCount} configured`, body: "查看工具服务、授权关系、协议探测和 HTTP/SSE 占位。" },
    { id: "suites", title: "套件与 Workflow", meta: `${counts.suiteCount} suites`, body: "管理角色化能力包、模板、依赖和工作流。" },
    { id: "apps", title: "自定义应用", meta: `${counts.appCount} apps`, body: "管理 app.json 模板、执行入口、调用面和权限风险。" },
    { id: "audit", title: "使用审计", meta: `${counts.auditCount} records`, body: "查看命令、定时任务和审批阻断的最近记录。" }
  ];
  return `
    <aside class="capability-nav panel">
      <div class="panel-title"><span>CAPABILITY MAP</span><small>分层导航</small></div>
      <div class="capability-nav-list">
        ${items.map((item) => `
          <button type="button" class="${activeCapabilitySection === item.id ? "active" : ""}" data-capability-section="${item.id}">
            <span>${escapeHtml(item.title)}</span>
            <strong>${escapeHtml(item.meta)}</strong>
            <small>${escapeHtml(item.body)}</small>
          </button>
        `).join("")}
      </div>
    </aside>
  `;
}

function renderCapabilityGuide(): string {
  const health = capabilityHealthCounts();
  return `
    <section class="capability-guide">
      <article>
        <span>第一步</span>
        <strong>先看治理总览</strong>
        <p>确认每个 Bot 授权了哪些能力，以及这些能力是否允许 Agent、命令或定时任务调用。</p>
      </article>
      <article>
        <span>第二步</span>
        <strong>处理诊断</strong>
        <p>ERROR 代表授权或运行前必须修；WARN 代表可继续配置，但需要理解风险或建设中边界。</p>
      </article>
      <article>
        <span>第三步</span>
        <strong>再进资源层</strong>
        <p>MCP、套件和自定义应用分开管理。模板先复制为本地副本，再进入 Manifest 编辑。</p>
      </article>
      <article>
        <span>健康度</span>
        <strong>${health.error} ERROR / ${health.warn} WARN / ${health.ok} OK</strong>
        <p>这里汇总扩展、IM 连接器和 MCP 诊断；真实 IM 收发仍以端到端验证为准。</p>
      </article>
    </section>
  `;
}

function renderCapabilityOverview(): string {
  return `
    ${renderCapabilityGuide()}
    <section class="panel market-panel governance-console-panel">
      <div class="panel-title"><span>BOT GOVERNANCE CONSOLE</span><small>${snapshot.config.bots.length} bots / ${capabilityAudit.summaries.length} audited targets</small></div>
      <div class="capability-note">治理控制台按 Bot 汇总已授权能力、policy、命令/定时绑定和最近使用审计。审计来自各 Bot 状态目录的 <code>capability-audit.jsonl</code>，只读展示，不作为授权来源。</div>
      <div class="governance-list">
        ${snapshot.config.bots.map((bot) => {
          const refs = botGovernanceRefs(bot);
          const commandCount = bot.commandBindings?.filter((binding) => binding.enabled).length ?? 0;
          const scheduledCount = bot.scheduledTasks?.filter((task) => task.enabled).length ?? 0;
          return `<article class="governance-bot">
            <div class="governance-bot-head">
              <div><strong>${escapeHtml(bot.name || bot.id)}</strong><small>${escapeHtml(bot.enabled ? "启用" : "停用")} / ${commandCount} commands / ${scheduledCount} scheduled</small></div>
              <span class="source-badge">${refs.filter((ref) => ref.enabled).length} refs</span>
            </div>
            <div class="governance-ref-list">
              ${refs.map((ref) => {
                const summaries = auditSummaryFor(bot.id, ref.kind, ref.id);
                const total = summaries.reduce((sum, item) => sum + item.total, 0);
                const failed = summaries.reduce((sum, item) => sum + item.failed + item.blocked + item.approvalRequired, 0);
                return `<div class="governance-ref-row ${ref.enabled ? "" : "disabled"}">
                  <span class="run-status cache">${escapeHtml(ref.kind.toUpperCase().slice(0, 3))}</span>
                  <div>
                    <strong>${escapeHtml(ref.id)}</strong>
                    <small>${escapeHtml(ref.enabled ? "已授权" : "已停用")} / ${escapeHtml(capabilityPolicyText(ref.policy))}</small>
                  </div>
                  <small>${total > 0 ? `${total} 次 / ${failed} 异常` : "暂无审计"}</small>
                </div>`;
              }).join("") || `<div class="empty">该 Bot 当前没有授权能力。</div>`}
            </div>
          </article>`;
        }).join("") || `<div class="empty">当前没有 Bot。</div>`}
      </div>
    </section>
  `;
}

function renderCapabilityDiagnostics(): string {
  return `
    <section class="capability-two-column">
      <section class="panel market-panel">
        <div class="panel-title"><span>EXTENSIBILITY GOVERNANCE</span><small>${snapshot.capabilityDiagnostics.length} diagnostics</small></div>
        <div class="capability-note">扩展治理集中检查自定义应用权限风险、套件缺失依赖和 Workflow 步骤引用。导入资源不等于授权给 Bot；授权前应先处理 ERROR/WARN 项。</div>
        <div class="market-skill-list compact-list">
          ${snapshot.capabilityDiagnostics.map((diagnostic) => `
            <article class="market-skill-row">
              <div class="skill-glyph">${escapeHtml(capabilityDiagnosticKindLabel(diagnostic.kind).slice(0, 2).toUpperCase())}</div>
              <div>
                <strong>${escapeHtml(diagnostic.name)}</strong>
                <p>${escapeHtml(`${capabilityDiagnosticKindLabel(diagnostic.kind)} / ${diagnostic.id} / ${riskLabel(diagnostic.risk)}`)}</p>
                ${diagnostic.issues.length ? `<small class="diagnostic-issues">${escapeHtml(diagnostic.issues.join("；"))}</small>` : `<small>未发现阻断性问题。</small>`}
                ${diagnostic.recommendations.length ? `<small>${escapeHtml(diagnostic.recommendations.join("；"))}</small>` : ""}
              </div>
              <span class="source-badge diagnostic-badge ${diagnostic.status}">${escapeHtml(diagnosticLabel(diagnostic.status))}</span>
            </article>
          `).join("") || `<div class="empty">当前没有需要治理的扩展能力。</div>`}
        </div>
      </section>
      <section class="panel market-panel">
        <div class="panel-title"><span>IM / CONNECTORS</span><small>${platformDiagnostics.length} bots</small></div>
        <div class="capability-note">连接器诊断检查消息平台、企业微信事件桥、飞书知识连接器和结果投递路由是否具备启动条件。OK 只代表本机配置完整，真实收发仍需端到端验证。</div>
        <div class="market-skill-list compact-list">
          ${platformDiagnostics.map((diagnostic) => `
            <article class="market-skill-row">
              <div class="skill-glyph">${escapeHtml(diagnostic.provider.slice(0, 2).toUpperCase())}</div>
              <div>
                <strong>${escapeHtml(diagnostic.botName)}</strong>
                <p>${escapeHtml(diagnostic.provider === "wecom" ? "企业微信主通道" : diagnostic.provider === "lark" ? "飞书主通道" : "钉钉预留通道")}</p>
                ${diagnostic.issues.length ? `<small class="diagnostic-issues">${escapeHtml(diagnostic.issues.join("；"))}</small>` : `<small>配置完整，等待真实环境验证。</small>`}
                ${diagnostic.recommendations.length ? `<small>${escapeHtml(diagnostic.recommendations.join("；"))}</small>` : ""}
              </div>
              <span class="source-badge diagnostic-badge ${diagnostic.status}">${escapeHtml(diagnosticLabel(diagnostic.status))}</span>
            </article>
          `).join("") || `<div class="empty">当前没有 Bot。</div>`}
        </div>
      </section>
    </section>
  `;
}

function renderCapabilityMcp(): string {
  return `
    <section class="panel market-panel">
      <div class="panel-title"><span>MCP SERVERS</span><small>${snapshot.config.mcpServers.length} configured</small></div>
      <div class="capability-note">MCP 服务是全局配置的工具能力。当前只有 stdio 可在 Bot 授权后进入 Claude Agent SDK、命令和定时任务；HTTP/SSE 会显示建设中诊断，不会被注入运行时。</div>
      <div class="capability-actions"><button type="button" class="ghost" id="refresh-mcp-diagnostics" ${snapshot.config.mcpServers.length === 0 ? "disabled" : ""}>刷新 MCP 诊断</button></div>
      <div class="market-skill-list">
        ${snapshot.config.mcpServers.map((server) => {
          const diagnostic = mcpDiagnostic(server.id);
          return `
          <article class="market-skill-row">
            <div class="skill-glyph">${escapeHtml(server.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(server.name)}</strong>
              <p>${escapeHtml(server.description || (server.transport === "stdio" ? `${server.command} ${server.args.join(" ")}`.trim() : server.url) || "未提供描述")}</p>
              <small>${escapeHtml(server.id)} / ${escapeHtml(server.transport)} / ${escapeHtml(server.enabled ? "已启用" : "已停用")} / ${escapeHtml(mcpInUseBy(server.id) || "未授权给任何 Bot")}</small>
              ${diagnostic ? `<small>${server.transport === "stdio" ? `命令: ${escapeHtml(diagnostic.commandResolved || "未解析")}` : `URL: ${escapeHtml(server.url || "未配置")}`} / 授权: ${escapeHtml(diagnostic.authorizedBotNames.join("、") || "无")}</small>` : ""}
              ${diagnostic?.protocol?.status === "ok" ? `<small class="mcp-tools">协议: OK / ${escapeHtml(String(diagnostic.protocol.durationMs ?? 0))}ms / tools: ${escapeHtml(diagnostic.protocol.tools.join("、") || "无")}</small>` : ""}
              ${diagnostic?.protocol?.status === "failed" ? `<small class="mcp-tools failed">协议: FAILED / ${escapeHtml(protocolFailureText(diagnostic.protocol))}</small>` : ""}
              ${server.transport === "stdio" && diagnostic?.protocol?.status === "not-run" ? `<small class="mcp-tools">协议: 未探测，点击刷新诊断后执行短生命周期握手。</small>` : ""}
              ${server.transport !== "stdio" ? `<small class="mcp-tools failed">建设中: ${escapeHtml(server.transport.toUpperCase())} MCP 当前仅保存 URL 和诊断，不进入 Agent、命令或定时任务。</small>` : ""}
              ${diagnostic?.lastProbe ? `<small class="mcp-tools">最近探测: ${escapeHtml(lastMcpProbeText(diagnostic))}</small>` : ""}
              ${diagnostic?.issues.length ? `<small class="diagnostic-issues">${escapeHtml(diagnostic.issues.join("；"))}</small>` : ""}
            </div>
            <span class="source-badge diagnostic-badge ${diagnostic?.status ?? "warn"}">${escapeHtml(diagnostic ? diagnosticLabel(diagnostic.status) : "CHECK")}</span>
          </article>`;
        }).join("") || `<div class="empty">当前没有 MCP 服务。前往配置页新增。</div>`}
      </div>
    </section>
  `;
}

function renderCapabilitySuites(): string {
  return `
    <section class="panel market-panel">
      <div class="panel-title"><span>SUITES</span><small>${snapshot.suites.length} imported</small></div>
      <div class="capability-note">套件用于把行业或角色相关的 Skill、自定义应用、MCP 和工作流说明组织成一个可挂载能力包。当前支持导入、预览、Bot 挂载授权、版本可信信息、升级和卸载。</div>
      <div class="market-skill-list">
        ${snapshot.suites.map((suite) => {
          const inUseBy = suiteInUseBy(suite.id);
          const flags = [
            suite.skills.length ? `${suite.skills.length} Skills` : "",
            suite.apps.length ? `${suite.apps.length} Apps` : "",
            suite.mcpServers.length ? `${suite.mcpServers.length} MCPs` : "",
            suite.workflows.length ? `${suite.workflows.length} Workflows` : ""
          ].filter(Boolean).join(" / ") || "空套件";
          const diagnostics = suite.diagnostics ?? [];
          const worstDiagnostic = diagnostics.some((item) => item.status === "error") ? "error" : diagnostics.some((item) => item.status === "warn") ? "warn" : "ok";
          const lifecycle = suite.source === "builtin" ? "内置模板" : suite.lifecycle?.status === "upgraded" ? "已升级" : suite.lifecycle?.status === "installed" ? "已安装" : "旧版导入";
          const trust = suite.trusted ? "可信" : "未标记可信";
          return `
          <article class="market-skill-row" data-preview-suite="${escapeHtml(suite.id)}">
            <div class="skill-glyph">${escapeHtml(suite.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(suite.name)}</strong>
              <p>${escapeHtml(suite.description || "未提供描述")}</p>
              <small>${escapeHtml(suite.id)} / v${escapeHtml(suite.version)} / ${escapeHtml(flags)} / ${escapeHtml(trust)} / ${escapeHtml(lifecycle)} / ${escapeHtml(inUseBy || "未授权给任何 Bot")}</small>
              <small class="diagnostic-line ${escapeHtml(worstDiagnostic)}">${escapeHtml(diagnostics.map((item) => item.message).join("；") || "manifest 校验通过")}</small>
            </div>
            <div class="resource-actions">
              <span class="source-badge ${suite.source}">${escapeHtml(capabilitySourceLabel(suite.source))}</span>
              ${resourceOpenButton("suite", suite.id)}
              ${suite.source === "local" ? `<button type="button" class="ghost compact upgrade-suite" data-suite-id="${escapeHtml(suite.id)}">升级</button>` : ""}
              ${suite.source === "local" ? `<button type="button" class="danger compact remove-suite" data-suite-id="${escapeHtml(suite.id)}" ${inUseBy ? "disabled" : ""}>卸载</button>` : ""}
            </div>
          </article>`;
        }).join("") || `<div class="empty">当前没有套件。点击右上角导入包含 suite.json 的目录。</div>`}
      </div>
    </section>
  `;
}

function renderCapabilityApps(): string {
  return `
    <section class="panel market-panel">
      <div class="panel-title"><span>CUSTOM APPS</span><small>${snapshot.customApps.length} imported</small></div>
      <div class="capability-note">自定义应用通过 <code>app.json</code> 导入，进入统一能力目录后仍需在 Bot 编辑器中显式授权。后续命令和定时任务会引用这些 capability，而不是直接执行任意命令。</div>
      <div class="market-skill-list">
        ${snapshot.customApps.map((customApp) => {
          const inUseBy = appInUseBy(customApp.id);
          const flags = [
            customApp.capabilities.agentCallable ? "Agent" : "",
            customApp.capabilities.commandCallable ? "命令" : "",
            customApp.capabilities.scheduledCallable ? "定时" : "",
            customApp.capabilities.hasUi ? "UI" : ""
          ].filter(Boolean).join(" / ") || "未声明调用面";
          const diagnostics = customApp.diagnostics ?? [];
          const worstDiagnostic = diagnostics.some((item) => item.status === "error") ? "error" : diagnostics.some((item) => item.status === "warn") ? "warn" : "ok";
          const lifecycle = customApp.source === "builtin" ? "内置模板" : customApp.lifecycle?.status === "upgraded" ? "已升级" : customApp.lifecycle?.status === "installed" ? "已安装" : "旧版导入";
          return `
          <article class="market-skill-row" data-preview-custom-app="${escapeHtml(customApp.id)}">
            <div class="skill-glyph">${escapeHtml(customApp.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(customApp.name)}</strong>
              <p>${escapeHtml(customApp.description || "未提供描述")}</p>
              <small>${escapeHtml(customApp.id)} / v${escapeHtml(customApp.version)} / ${escapeHtml(customApp.entry.type)} / ${escapeHtml(customAppAvailabilityLabel(customApp))} / ${escapeHtml(flags)} / ${escapeHtml(lifecycle)} / ${escapeHtml(inUseBy || "未授权给任何 Bot")}</small>
              <small class="diagnostic-line ${escapeHtml(worstDiagnostic)}">${escapeHtml(diagnostics.map((item) => item.message).join("；") || "manifest 校验通过")}</small>
            </div>
            <div class="resource-actions">
              <span class="source-badge ${customApp.source}">${escapeHtml(capabilitySourceLabel(customApp.source))}</span>
              ${resourceOpenButton("app", customApp.id)}
              ${customApp.source === "local" ? `<button type="button" class="ghost compact upgrade-custom-app" data-app-id="${escapeHtml(customApp.id)}">升级</button>` : ""}
              ${customApp.source === "local" ? `<button type="button" class="danger compact remove-custom-app" data-app-id="${escapeHtml(customApp.id)}" ${inUseBy ? "disabled" : ""}>卸载</button>` : ""}
            </div>
          </article>`;
        }).join("") || `<div class="empty">当前没有自定义应用。点击右上角导入包含 app.json 的目录。</div>`}
      </div>
    </section>
  `;
}

function renderCapabilityAudit(): string {
  return `
    <section class="panel market-panel governance-console-panel">
      <div class="panel-title"><span>CAPABILITY USAGE AUDIT</span><small>${capabilityAudit.recent.length} recent records</small></div>
      <div class="capability-note">这里展示最近能力调用，不承担授权职责。要修改授权和运行策略，请回到配置页的 Bot 编辑弹窗。</div>
      <div class="run-history-list">
        ${capabilityAudit.recent.map((record) => `
          <article class="run-history-row ${record.status === "success" ? "success" : record.status === "failed" ? "failed" : "skipped"}">
            <div class="run-status ${record.status === "success" ? "success" : record.status === "failed" ? "failed" : "skipped"}">${escapeHtml(auditStatusLabel(record.status))}</div>
            <div>
              <strong>${escapeHtml(record.capability.name || record.capability.id)}</strong>
              <p>${escapeHtml(snapshot.config.bots.find((bot) => bot.id === record.botId)?.name || record.botId)} / ${escapeHtml(auditTriggerLabel(record.trigger))} / ${escapeHtml(record.source)} / ${new Date(record.at).toLocaleString()}</p>
              <small>${escapeHtml(`${record.capability.kind}:${record.capability.id}`)}${record.durationMs !== undefined ? ` / ${record.durationMs}ms` : ""}${record.detail ? ` / ${escapeHtml(record.detail)}` : ""}</small>
            </div>
          </article>`).join("") || `<div class="empty">还没有能力使用审计。命令、定时任务和审批阻断发生后会写入这里。</div>`}
      </div>
    </section>
  `;
}

function renderCapabilities(): string {
  const appCount = snapshot.customApps.length;
  const skillCount = snapshot.skills.length;
  const suiteCount = snapshot.suites.length;
  const mcpCount = snapshot.config.mcpServers.length;
  const mountedRefs = snapshot.config.bots.reduce((count, bot) => count + (bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0) + bot.skillNames.length, 0);
  const diagnosticIssues = snapshot.capabilityDiagnostics.filter((item) => item.status !== "ok").length
    + platformDiagnostics.filter((item) => item.status !== "ok").length
    + mcpDiagnostics.filter((item) => item.status !== "ok").length;
  const sections: Record<CapabilitySection, string> = {
    overview: renderCapabilityOverview(),
    diagnostics: renderCapabilityDiagnostics(),
    mcp: renderCapabilityMcp(),
    suites: renderCapabilitySuites(),
    apps: renderCapabilityApps(),
    audit: renderCapabilityAudit()
  };
  return `
    <section class="metrics">
      <article><span>能力目录</span><strong>${snapshot.capabilities.length}</strong></article>
      <article><span>Skills</span><strong>${skillCount}</strong></article>
      <article><span>自定义应用 / 套件 / MCP</span><strong>${appCount} / ${suiteCount} / ${mcpCount}</strong></article>
      <article><span>Bot 挂载引用</span><strong>${mountedRefs}</strong></article>
    </section>
    ${pageTabs([
      { id: "overview", label: "治理总览", meta: `${mountedRefs} refs` },
      { id: "diagnostics", label: "诊断排障", meta: `${diagnosticIssues} issues` },
      { id: "mcp", label: "MCP", meta: `${mcpCount}` },
      { id: "suites", label: "套件/Workflow", meta: `${suiteCount}` },
      { id: "apps", label: "自定义应用", meta: `${appCount}` },
      { id: "audit", label: "使用审计", meta: `${capabilityAudit.recent.length}` }
    ], activeCapabilitySection, "data-capability-section")}
    <section class="capability-layout">
      <div class="capability-content">
        ${sections[activeCapabilitySection]}
      </div>
    </section>
  `;
}

function renderSkills(): string {
  const localCount = snapshot.skills.filter((skill) => skill.source === "local").length;
  const marketCount = snapshot.skills.filter((skill) => skill.source === "market").length;
  const builtinCount = snapshot.skills.filter((skill) => skill.source === "builtin").length;
  const visibleSkills = snapshot.skills.filter((skill) => marketSkillMatches(skill));
  return `
    <section class="metrics">
      <article><span>全部 Skills</span><strong>${snapshot.skills.length}</strong></article>
      <article><span>本地导入</span><strong>${localCount}</strong></article>
      <article><span>Git 市场</span><strong>${marketCount}</strong></article>
      <article><span>应用内置</span><strong>${builtinCount}</strong></article>
    </section>
    ${pageTabs([
      { id: "all", label: "全部", meta: `${snapshot.skills.length}` },
      { id: "local", label: "本地导入", meta: `${localCount}` },
      { id: "market", label: "Git 市场", meta: `${marketCount}` },
      { id: "builtin", label: "应用内置", meta: `${builtinCount}` },
      { id: "unused", label: "未授权", meta: `${snapshot.skills.filter((skill) => !snapshot.config.bots.some((bot) => bot.skillNames.includes(skill.name))).length}` }
    ], marketSource, "data-market-source-tab")}
    <section class="panel market-panel">
      <div class="panel-title"><span>LOCAL SKILL MARKET</span><small>${snapshot.skills.length} available</small></div>
      <div class="market-toolbar">
        <input id="market-search" type="search" value="${escapeHtml(marketSearch)}" placeholder="搜索 Skill 名称或描述" />
        <select id="market-source">
          <option value="all" ${marketSource === "all" ? "selected" : ""}>全部来源</option>
          <option value="local" ${marketSource === "local" ? "selected" : ""}>本地导入</option>
          <option value="market" ${marketSource === "market" ? "selected" : ""}>Git 市场</option>
          <option value="builtin" ${marketSource === "builtin" ? "selected" : ""}>应用内置</option>
          <option value="unused" ${marketSource === "unused" ? "selected" : ""}>未授权给任何 Bot</option>
        </select>
        <button class="ghost" id="market-sync" ${snapshot.config.skillMarket.enabled && snapshot.config.skillMarket.repositoryUrl ? "" : "disabled"}>同步 Git 市场</button>
      </div>
      <div class="market-skill-list">
        ${visibleSkills.map((skill) => {
          const inUseBy = snapshot.config.bots.filter((bot) => bot.skillNames.includes(skill.name)).map((bot) => bot.name).join("、");
          return `
          <article class="market-skill-row" data-preview-skill="${escapeHtml(skill.name)}" data-market-search="${escapeHtml(`${skill.name} ${skill.description}`.toLowerCase())}" data-market-source="${skill.source}" data-market-unused="${snapshot.config.bots.some((bot) => bot.skillNames.includes(skill.name)) ? "false" : "true"}">
            <div class="skill-glyph">${escapeHtml(skill.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(skill.name)}</strong>
              <p>${escapeHtml(skill.description || "未提供描述")}</p>
              <small>${escapeHtml(inUseBy || "未授权给任何 Bot")}</small>
            </div>
            <div class="resource-actions">
              <span class="source-badge ${skill.source}">${skillSourceLabel(skill.source)}</span>
              ${resourceOpenButton("skill", skill.name)}
              ${skill.source === "local" ? `<button class="danger remove-local-skill" data-name="${escapeHtml(skill.name)}" ${inUseBy ? "disabled" : ""} title="${inUseBy ? `正在被 ${escapeHtml(inUseBy)} 使用，先取消 Bot 授权后才能删除` : "删除本地 Skill"}">删除</button>` : ""}
            </div>
          </article>`;
        }).join("") || `<div class="empty">${snapshot.skills.length === 0 ? "当前没有可用 Skill。" : "当前筛选条件下没有 Skill。"}</div>`}
      </div>
    </section>
  `;
}

function renderPreview(): string {
  return `<div class="modal-backdrop" id="preview-backdrop"><section class="release-modal preview-modal" role="dialog" aria-modal="true">
    <div class="release-modal-header"><h2>${escapeHtml(preview?.title)}</h2><button class="ghost" id="close-preview">关闭</button></div>
    ${preview?.html ?? `<pre class="preview-content">${escapeHtml(preview?.body)}</pre>`}
  </section></div>`;
}

function renderCustomAppManifestEditor(value: CustomAppPreview): string {
  const app = value.app;
  const canEdit = app.source === "local";
  const suggestedId = `${app.id.replace(/^template[._-]/, "")}-local`;
  const processing = snapshot.config.runtime.customAppReplyProcessingByApp?.[app.id]
    ?? snapshot.config.runtime.customAppReplyProcessing
    ?? { mode: "raw", prompt: "", maxInputChars: 12000 };
  return `<div class="manifest-editor-content" data-editor-kind="app" data-editor-id="${escapeHtml(app.id)}">
    <section class="manifest-guide">
      <div>
        <h3>这个自定义应用是什么</h3>
        <p>自定义应用是一个可被 Bot 授权的本地能力，必须用 <code>app.json</code> 声明入口、调用面和权限。导入或复制模板后不会自动授权给 Bot，需要在 Bot 编辑弹窗中勾选。</p>
        <p><strong>当前状态：</strong>${escapeHtml(capabilitySourceLabel(app.source))} / ${escapeHtml(customAppAvailabilityLabel(app))} / ${escapeHtml(app.capabilities.commandCallable ? "可作为命令目标" : "不可作为命令目标")} / ${escapeHtml(app.capabilities.scheduledCallable ? "可作为定时目标" : "不可作为定时目标")}</p>
      </div>
      <div>
        <h3>怎么改</h3>
        <ol>
          <li>内置模板先复制为本地副本，再编辑。</li>
          <li><code>id</code> 是能力 ID，编辑现有本地应用时不能改；需要新 ID 时复制模板或重新导入。</li>
          <li><code>entry.command</code> 和 <code>entry.args</code> 决定实际执行入口；Node 模板通常保留 <code>node</code> 和 <code>index.js</code>。</li>
          <li><code>capabilities</code> 决定是否进入 Agent、命令、定时或 UI 入口；建设中的入口不会进入命令/定时目标。</li>
          <li><code>permissions.requiresOwnerApproval</code> 建议用于 executable、网络访问或高风险应用。</li>
        </ol>
      </div>
    </section>
    <section class="manifest-editor-panel">
      <div class="skill-access-heading"><span>回复后处理${helpButton("customAppReplyProcessing")}</span><small>${processing.mode === "summarize" ? "summarize" : "raw"}</small></div>
      <small>这里的配置只作用于当前自定义应用。启用总结时，主进程使用当前模型配置做一次无工具文本总结，不把 API Key 下放给应用脚本。</small>
      <div class="command-binding-row">
        <label><span>处理方式</span><select id="custom-app-processing-mode"><option value="raw" ${processing.mode !== "summarize" ? "selected" : ""}>原样返回</option><option value="summarize" ${processing.mode === "summarize" ? "selected" : ""}>交给大模型总结后返回</option></select></label>
        <label><span>总结输入上限</span><input id="custom-app-processing-max-input" type="number" min="1000" max="60000" value="${processing.maxInputChars ?? 12000}" /></label>
        <label class="command-wide"><span>总结提示词</span><textarea id="custom-app-processing-prompt" rows="3">${escapeHtml(processing.prompt ?? "")}</textarea></label>
      </div>
      <div class="form-actions inline-actions">
        <button type="button" class="primary" id="save-custom-app-processing">保存回复处理配置</button>
      </div>
    </section>
    <section class="manifest-editor-panel">
      <div class="session-meta">
        <span><strong>ID</strong>${escapeHtml(app.id)}</span>
        <span><strong>版本</strong>${escapeHtml(app.version)}</span>
        <span><strong>入口</strong>${escapeHtml(app.entry.type)}</span>
        <span><strong>文件</strong>${value.files.length} files</span>
      </div>
      ${canEdit ? "" : `<label class="manifest-copy-control"><span>复制为本地应用 ID</span><input id="manifest-copy-id" value="${escapeHtml(suggestedId)}" /><button type="button" class="ghost" id="copy-custom-app-template">复制模板</button></label>`}
      <label><span>app.json</span><textarea id="manifest-editor-text" spellcheck="false">${escapeHtml(value.manifest)}</textarea></label>
      <div class="form-actions inline-actions">
        ${canEdit ? `<button type="button" class="primary" id="save-custom-app-manifest">保存 manifest</button>` : `<button type="button" class="primary" id="save-custom-app-manifest" disabled>内置模板需先复制</button>`}
        ${resourceOpenButton("app", app.id)}
      </div>
      <details>
        <summary>文件清单</summary>
        <pre class="preview-content">${escapeHtml(value.files.join("\n") || "无文件")}</pre>
      </details>
    </section>
  </div>`;
}

function renderSuiteManifestEditor(value: SuitePreview): string {
  const suite = value.suite;
  const canEdit = suite.source === "local";
  const suggestedId = `${suite.id.replace(/^template[._-]/, "")}-local`;
  return `<div class="manifest-editor-content" data-editor-kind="suite" data-editor-id="${escapeHtml(suite.id)}">
    <section class="manifest-guide">
      <div>
        <h3>这个套件是什么</h3>
        <p>套件用于把某个角色、行业或流程需要的 Skill、自定义应用、MCP 和 Workflow 组织成一个可挂载能力包。挂载套件不会自动授予底层能力，Bot 仍需显式授权相关 Skill/App/MCP。</p>
        <p><strong>当前状态：</strong>${escapeHtml(capabilitySourceLabel(suite.source))} / ${escapeHtml(suite.trusted ? "可信来源" : "未标记可信")} / ${suite.workflows.length} Workflows / ${suite.skills.length} Skills / ${suite.apps.length} Apps / ${suite.mcpServers.length} MCPs</p>
      </div>
      <div>
        <h3>怎么改</h3>
        <ol>
          <li>内置模板先复制为本地副本，再编辑。</li>
          <li><code>id</code> 是套件 ID，编辑现有本地套件时不能改；需要新 ID 时复制模板或重新导入。</li>
          <li><code>instructions</code> 会进入 Agent 上下文，用于说明这个套件适合什么场景。</li>
          <li><code>skills</code>、<code>apps</code>、<code>mcpServers</code> 是推荐依赖，不会自动授权。</li>
          <li><code>workflows.steps</code> 可声明 prompt 步骤或 capability 步骤，支持 input、condition、repeat、continueOnError、timeoutSeconds 和 retry。</li>
        </ol>
      </div>
    </section>
    <section class="manifest-editor-panel">
      <div class="session-meta">
        <span><strong>ID</strong>${escapeHtml(suite.id)}</span>
        <span><strong>版本</strong>${escapeHtml(suite.version)}</span>
        <span><strong>发布者</strong>${escapeHtml(suite.publisher || "未声明")}</span>
        <span><strong>标签</strong>${escapeHtml(suite.tags.join("、") || "无")}</span>
      </div>
      ${canEdit ? "" : `<label class="manifest-copy-control"><span>复制为本地套件 ID</span><input id="manifest-copy-id" value="${escapeHtml(suggestedId)}" /><button type="button" class="ghost" id="copy-suite-template">复制模板</button></label>`}
      <label><span>suite.json</span><textarea id="manifest-editor-text" spellcheck="false">${escapeHtml(value.manifest)}</textarea></label>
      <div class="form-actions inline-actions">
        ${canEdit ? `<button type="button" class="primary" id="save-suite-manifest">保存 manifest</button>` : `<button type="button" class="primary" id="save-suite-manifest" disabled>内置模板需先复制</button>`}
        ${resourceOpenButton("suite", suite.id)}
      </div>
      <details>
        <summary>文件清单</summary>
        <pre class="preview-content">${escapeHtml(value.files.join("\n") || "无文件")}</pre>
      </details>
    </section>
  </div>`;
}

function renderSessionDetail(value: StorageSessionDetail): string {
  const botName = snapshot.config.bots.find((bot) => bot.id === value.botId)?.name || value.botId;
  const turns = value.transcript.length > 0
    ? value.transcript.map((turn, index) => {
      const events = (turn.events?.length ? turn.events : [
        { time: turn.time, type: "received" as const, title: "接收消息", body: turn.user },
        { time: turn.time, type: "reply" as const, title: "最终回复", body: turn.assistant }
      ]).map((event) => `
        <article class="session-event ${escapeHtml(event.type)}" data-session-event-type="${escapeHtml(event.type)}">
          <div class="session-event-head">
            <strong>${escapeHtml(event.title)}</strong>
            <time>${escapeHtml(new Date(event.time).toLocaleString())}</time>
          </div>
          <pre>${escapeHtml(event.body)}</pre>
        </article>`).join("");
      return `
        <section class="session-turn">
          <div class="session-turn-head">
            <strong>#${index + 1} ${escapeHtml(turn.messageId)}</strong>
            <time>${escapeHtml(new Date(turn.time).toLocaleString())}</time>
          </div>
          ${events}
        </section>`;
    }).join("")
    : `<div class="empty">暂无可回放对话记录。旧版本会话只保存消息 ID：${escapeHtml(value.messageIds.join(", ") || "无")}</div>`;
  const files = value.files.length > 0
    ? value.files.map((file) => `<li><span>${escapeHtml(file.path)}</span><small>${formatBytes(file.bytes)}</small></li>`).join("")
    : `<li><span>无</span><small>0 B</small></li>`;
  return `<div class="session-detail-content">
    <div class="session-detail-toolbar">
      <select id="session-event-filter">
        <option value="all">全部事件</option>
        <option value="received">接收消息</option>
        <option value="progress">Agent 过程</option>
        <option value="notice">提示</option>
        <option value="reply">最终回复</option>
        <option value="error">错误</option>
      </select>
      <button type="button" class="ghost compact" id="export-session-detail">导出 JSON</button>
    </div>
    <div class="session-meta">
      <span><strong>Bot</strong>${escapeHtml(botName)}</span>
      <span><strong>Claude session</strong>${escapeHtml(value.sessionId)}</span>
      <span><strong>更新时间</strong>${escapeHtml(new Date(value.updatedAt).toLocaleString())}</span>
      <span><strong>会话键</strong>${escapeHtml(value.conversationKey)}</span>
    </div>
    <div class="session-detail-grid">
      <div class="session-timeline">${turns}</div>
      <aside class="session-files">
        <h3>Workspace files</h3>
        <ul>${files}</ul>
      </aside>
    </div>
  </div>`;
}

function renderScheduledRunDetail(run: ScheduledTaskRunSummary): string {
  return `<div class="run-detail-content">
    <div class="session-meta">
      <span><strong>任务</strong>${escapeHtml(run.taskName)}</span>
      <span><strong>Bot</strong>${escapeHtml(run.botName)}</span>
      <span><strong>状态</strong>${escapeHtml(runStatusLabel(run.status))}</span>
      <span><strong>耗时</strong>${escapeHtml(formatDuration(runDurationMs(run)))}</span>
      <span><strong>开始</strong>${escapeHtml(new Date(run.startedAt).toLocaleString())}</span>
      <span><strong>结束</strong>${escapeHtml(new Date(run.finishedAt).toLocaleString())}</span>
    </div>
    <pre class="run-detail-body">${escapeHtml(run.detail || "无运行详情。")}</pre>
  </div>`;
}

function renderHelpModal(): string {
  const topic = helpTopics[helpTopicKey];
  if (!topic) return "";
  return `<div class="modal-backdrop" id="help-backdrop"><section class="release-modal help-modal" role="dialog" aria-modal="true">
    <div class="release-modal-header"><h2>${escapeHtml(topic.title)}</h2><button class="ghost" id="close-help">关闭</button></div>
    <div class="help-content">${escapeHtml(topic.body)}</div>
  </section></div>`;
}

function renderReleaseNotes(): string {
  return `
    <div class="modal-backdrop" id="release-notes-backdrop">
      <section class="release-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
        <div class="release-modal-header">
          <div>
            <p class="eyebrow">QUARKFANTOOLS / VERSION ${escapeHtml(applicationInfo.version)}</p>
            <h2 id="release-notes-title">更新记录</h2>
          </div>
          <button class="ghost release-close" id="close-release-notes">关闭</button>
        </div>
        <div class="release-list">
          ${applicationInfo.releases.map((release, index) => `
            <article class="release-entry ${index === 0 ? "current" : ""}">
              <div class="release-version"><strong>v${escapeHtml(release.version)}</strong><time>${escapeHtml(release.date)}</time></div>
              <ul>${release.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join("")}</ul>
            </article>`).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderManual(): string {
  return `
    <div class="modal-backdrop" id="manual-backdrop">
      <section class="release-modal manual-modal" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <div class="release-modal-header">
          <div>
            <p class="eyebrow">QUARKFANTOOLS / USER MANUAL</p>
            <h2 id="manual-title">使用手册</h2>
          </div>
          <button class="ghost release-close" id="close-manual">关闭</button>
        </div>
        <div class="manual-content">
          <section>
            <h3>快速开始</h3>
            <ol>
              <li>进入“配置”，填写模型服务的 Base URL、模型名和 API Key。</li>
              <li>在 Bot 列表中新增机器人，选择飞书消息平台并填写对应 App ID / App Secret。企业微信入口当前暂时封闭。</li>
              <li>按需点击“用户态 OAuth”，完成文档搜索、导出和读取所需的用户授权。</li>
              <li>给 Bot 勾选允许访问的 Skills，保存后到“运行台”启动监听。</li>
            </ol>
          </section>
          <section>
            <h3>场景一：飞书群里问资料</h3>
            <ol>
              <li>在飞书开放平台确认应用已发布，且群成员在应用可用范围内。</li>
              <li>配置飞书 Bot 的 App ID、App Secret，接收和回复身份优先使用 Bot。</li>
              <li>给 Bot 授权需要的 Skills，例如 Office、文档问答或业务知识 Skill。</li>
              <li>如果要搜索飞书文档，点击“用户态 OAuth”；缺少导出或云盘权限时，把 scope 加到“用户态 OAuth 额外权限”后重新授权。</li>
              <li>在运行台启动 Bot。群里 @ 机器人并提问，应用会添加处理中表情，完成后回复并移除表情。</li>
            </ol>
          </section>
          <section>
            <h3>场景二：企业微信能力暂时封闭</h3>
            <ol>
              <li>由于企业微信官方 CLI 不提供稳定的事件长连接，指定会话轮询体验和稳定性不足，当前版本暂时封闭企业微信 Provider。</li>
              <li>Bot 编辑弹窗会保留企业微信历史配置，但消息平台选项、CLI 缓存初始化、聊天列表获取、事件桥和轮询配置均不可操作。</li>
              <li>运行台启动旧企业微信 Bot 时会显示“企业微信 Provider 因官方能力限制暂时封闭”，不会启动监听、轮询或投递。</li>
              <li>当前需要上线的机器人请先选择飞书作为消息平台。企业微信后续会在有稳定回调或事件桥方案后再开放。</li>
            </ol>
          </section>
          <section>
            <h3>场景三：配置 /日报 命令</h3>
            <ol>
              <li>先授权目标能力，可以是 Skill、MCP、套件、Workflow 或声明 commandCallable 的自定义应用。</li>
              <li>在 Bot 编辑弹窗的“命令映射”新增命令，例如 <code>daily</code>，可增加别名 <code>日报, report</code>。</li>
              <li>选择目标能力，填写说明，必要时用 Prompt 模板固定格式。模板里用 <code>{{args}}</code> 引用用户在命令后的参数。</li>
              <li>保存后，用户发送 <code>/daily 今天质量异常</code> 即会优先走该命令；发送 <code>/help</code> 可查看当前 Bot 已启用命令。</li>
            </ol>
          </section>
          <section>
            <h3>场景四：定时推送日报</h3>
            <ol>
              <li>先确认投递 chat_id，定时任务只会投递到配置的 chat。</li>
              <li>在 Bot 编辑弹窗新增定时任务，选择 interval、daily、weekly 或 5 段 cron。</li>
              <li>目标选 Agent 时走 Bot 默认授权能力；目标选 command 时复用已启用命令；目标选 capability 时直接调用某个已授权能力。</li>
              <li>配置失败重试次数和延迟。连续失败超过上限后任务会暂停自动排期，并在任务中心显示暂停原因。</li>
              <li>保存后可在 Bot 编辑弹窗或“定时任务”页点击“立即执行”，确认运行历史和投递结果。</li>
            </ol>
          </section>
          <section>
            <h3>场景五：用套件和 Workflow 固化流程</h3>
            <ol>
              <li>准备包含 <code>suite.json</code> 的目录，声明套件 ID、版本、发布者、可信标记、依赖能力和 workflows。</li>
              <li>在“能力”页导入套件，先看 manifest 诊断和缺失依赖。</li>
              <li>在 Bot 编辑弹窗授权套件，同时确认套件引用的 Skill、自定义应用或 MCP 也已按需授权。</li>
              <li>Workflow steps 可使用输入模板、条件跳过、循环、失败恢复、超时和重试；定时触发时步骤摘要会写入运行历史。</li>
              <li>如果套件仍被 Bot、命令或定时任务引用，卸载会被阻止，需要先取消引用。</li>
            </ol>
          </section>
          <section>
            <h3>场景六：接入 MCP 工具</h3>
            <ol>
              <li>stdio MCP：填写命令、参数、cwd 和环境变量；点击“刷新 MCP 诊断”会做短生命周期 initialize 和 tools/list 探测。</li>
              <li>HTTP/SSE MCP：当前可保存 URL 并做占位诊断，但暂不注入 Claude Agent SDK，真实运行待后续端到端验证。</li>
              <li>到 Bot 编辑弹窗显式勾选 MCP，并用运行策略决定是否允许 Agent、命令或定时任务使用。</li>
              <li>命令目标选择 MCP 时，Agent 会聚焦该 MCP；如果工具不可用，需要在回复中说明原因。</li>
            </ol>
          </section>
          <section>
            <h3>场景七：升级和恢复</h3>
            <ol>
              <li>后续安装包默认只面向 Apple Silicon / arm64。升级前建议先退出旧应用。</li>
              <li>从旧 <code>qah</code> 数据目录迁移时，应用会先创建 <code>backups/legacy-qah-&lt;timestamp&gt;/</code>，再迁移配置、workspace 和状态。</li>
              <li>升级后若用户态飞书资料读取失败，需要在对应 Bot 配置页重新完成用户态 OAuth。</li>
              <li>如果升级后配置或状态异常，先不要删除备份目录；可按备份中的 config、workspace、state 人工恢复。</li>
            </ol>
          </section>
          <section>
            <h3>模型配置</h3>
            <p><strong>Provider 名称</strong>只用于界面展示。<strong>Claude Base URL</strong> 必须兼容 Claude Messages API 和工具调用。<strong>模型</strong>要填写服务商提供的模型名。<strong>API Key</strong>只保存在本机。</p>
            <p><strong>最大并发任务数</strong>控制不同会话同时运行的 Agent 数量；同一会话仍串行。<strong>单次 Agent 最大步数</strong>用于复杂检索，默认 60。<strong>多模态视觉能力</strong>影响图片和 PPT 视觉预览是否传给模型。</p>
            <p><strong>界面主题</strong>支持跟随系统、浅色和深色。跟随系统时会随 macOS 外观切换，不影响 Bot、会话或权限配置。</p>
          </section>
          <section>
            <h3>MCP 服务</h3>
            <p>“配置”页支持新增全局 MCP 服务。<code>stdio</code> 需要填写命令、参数和可选环境变量，可进入 Agent、命令和定时任务；HTTP/SSE 当前只保存 URL 并显示建设中诊断。</p>
            <p>当前版本会对当前 Bot 启用严格 MCP 配置模式，只把已授权且传输类型为 <code>stdio</code> 的 MCP 传给 Claude Agent SDK，不读取其他磁盘上的 MCP 配置来源。“能力”页会展示 MCP 诊断状态，包括命令或 URL、cwd、环境变量、Bot 授权、stdio 协议握手和工具列表预览。</p>
          </section>
          <section>
            <h3>机器人配置</h3>
            <p>配置页中的 Bot 以列表展示，点击行打开编辑弹窗。每个 Bot 拥有独立 IM CLI 状态、连接器状态、Claude home、会话 workspace 和 Skill 授权。</p>
            <p><strong>消息平台</strong>控制从哪个 IM 接收消息并默认回复。当前正式开放飞书，填写 <strong>App ID / App Secret</strong>；企业微信因官方能力限制暂时封闭，历史 Bot ID / Secret 会保留但不会启动。</p>
            <p><strong>企业微信事件桥命令</strong>、<strong>企业微信轮询会话</strong>和<strong>获取聊天列表</strong>当前均不可操作，只保留历史配置。应用不会调用 <code>wecom-cli msg get_message</code> 或 <code>get_msg_chat_list</code>。</p>
            <p><strong>飞书知识连接器</strong>用于后续非飞书入口恢复时读取飞书文档、Wiki、云盘和云 PPT。<strong>结果投递路由</strong>可把最终回复复制发送到另一个平台 chat；当前企业微信投递目标暂时封闭。</p>
            <p><strong>用户态 OAuth 额外权限</strong>用于补充飞书 scope，例如 <code>drive:export:readonly</code>、<code>docs:document:export</code>。保存后需要重新点击“用户态 OAuth”，并且飞书开放平台也必须先开通对应应用权限。</p>
            <p>用户态 OAuth 只授权当前用户用于搜索、读取或导出飞书资料，不会把机器人开放给群内所有成员。若其他成员 @ 机器人时看到“暂时还无法与我对话，需要机器人主人的允许”，需要到飞书开放平台检查该应用的发布状态和可用范围。</p>
            <p><strong>Owner open_id</strong>用于人工协助卡片。<strong>向用户展示工作过程</strong>只展示工具调用和检索进度，不展示模型隐藏推理。</p>
          </section>
          <section>
            <h3>Skill 与技能市场</h3>
            <p>Skill 必须包含 <code>SKILL.md</code>。本地导入或 Git 市场同步后默认不会授权给任何 Bot，需要在 Bot 编辑弹窗里显式勾选。</p>
            <p>Git 技能市场只支持 HTTPS 仓库。仓库根目录、一级子目录、二级子目录中的 <code>SKILL.md</code> 会被发现；更深层级当前不会扫描。</p>
            <p>技能市场列表可按来源筛选，点击 Skill 可预览说明和文件清单。正在被 Bot 使用的本地 Skill 不能直接删除，需要先取消授权。</p>
          </section>
          <section>
            <h3>能力与自定义应用</h3>
            <p>“能力”页展示 Bot 可治理能力目录。自定义应用必须包含 <code>app.json</code>，导入后会复制到应用受管目录，并以 <code>kind=app</code> 进入能力目录。</p>
            <p>导入自定义应用不会自动授权给任何 Bot。需要在 Bot 编辑弹窗里勾选后，后续命令、定时任务或 Agent 才能在该 Bot 的权限边界内使用。</p>
            <p><code>app.json</code> 会声明入口、输入输出协议、可调用面和权限需求。当前 <code>node</code> 和受控 <code>executable</code> 可执行；<code>webview</code>、<code>mcp-adapter</code> 和 <code>workflow</code> 会显示建设中说明，不会出现在命令或定时任务目标里。能力页会展示 manifest 诊断、生命周期状态，并支持升级和卸载；卸载前必须没有 Bot 授权或套件依赖。授权前应确认入口和权限风险；自定义应用默认不能访问其他 Bot 的状态或 workspace。</p>
            <p><strong>从模板开始：</strong>能力页内置“日报生成器模板”和“审批摘要模板”。点击卡片后先阅读左侧说明，内置模板不能直接编辑；填写新的本地应用 ID 后点击“复制模板”，再在 manifest 编辑器里修改名称、说明、入口和调用面。</p>
            <p><strong>常用字段：</strong><code>id</code> 是稳定能力 ID；<code>entry.type</code> 当前建议用 <code>node</code> 或 <code>executable</code>；<code>entry.command</code>/<code>entry.args</code> 是执行入口；<code>capabilities.commandCallable</code> 控制是否能配置成 <code>/xxx</code> 命令；<code>capabilities.scheduledCallable</code> 控制是否能被定时任务调用；<code>permissions.requiresOwnerApproval</code> 用于高风险能力审批。</p>
            <p><strong>保存和验证：</strong>本地应用可在弹窗中直接编辑 <code>app.json</code> 并保存。保存时应用会先校验 manifest；如果 JSON 错误、缺少入口或权限字段不合法，会回滚到保存前内容并提示错误。</p>
          </section>
          <section>
            <h3>套件</h3>
            <p>套件目录必须包含 <code>suite.json</code>。套件用于组合 Skills、自定义应用、MCP 和工作流说明，适合按角色或行业分发一组能力。</p>
            <p>当前版本支持导入、预览、Bot 挂载授权、版本和可信来源展示、升级和卸载。挂载套件不会自动扩大该 Bot 的底层 Skill、自定义应用或 MCP 权限；命令和普通 Agent 执行仍会按具体能力授权再校验。</p>
            <p>Workflow steps 支持输入模板、步骤输出变量、条件跳过、循环、失败恢复、超时和重试；定时任务触发时会把步骤摘要写入运行历史。</p>
            <p><strong>从模板开始：</strong>能力页内置“质量复盘套件模板”和“门店日报套件模板”。点击卡片后可查看套件说明、依赖、Workflow 和文件清单；内置模板先复制为本地套件，再编辑 <code>suite.json</code>。</p>
            <p><strong>常用字段：</strong><code>instructions</code> 会进入 Agent 上下文，用于说明套件适用场景；<code>skills</code>、<code>apps</code>、<code>mcpServers</code> 是推荐依赖，不会自动授权；<code>workflows</code> 可定义可命令调用或定时调用的流程；<code>trusted</code> 用于提醒用户是否确认来源。</p>
            <p><strong>Workflow 写法：</strong><code>prompt</code> 步骤用于让 Agent 处理一段提示；<code>capability</code> 步骤用于调用已授权 Skill、stdio MCP、套件或自定义应用。步骤可加 <code>input</code> 模板引用 <code>{{input}}</code>、<code>{{previous}}</code> 和 <code>{{steps.stepId}}</code>，也可配置 <code>condition</code>、<code>repeat</code>、<code>continueOnError</code>、<code>timeoutSeconds</code> 和 <code>retry.maxAttempts</code>。</p>
            <p><strong>保存和验证：</strong>本地套件可在弹窗中直接编辑 <code>suite.json</code> 并保存。保存时会校验 JSON、Workflow 步骤 ID、capability 引用格式和导入阻断项；失败会回滚并提示错误。</p>
          </section>
          <section>
            <h3>MCP</h3>
            <p>MCP 服务在“配置”页按全局方式维护。<code>stdio</code> 配置完成后，还需要在 Bot 编辑弹窗里显式勾选授权，并用同一行策略控制是否开放给 Agent、命令和定时任务。</p>
            <p>当前版本只会把已授权的 <code>stdio</code> MCP 注入 Claude Agent SDK，并启用严格 MCP 配置模式，不读取其他磁盘上的 MCP 配置来源。HTTP/SSE MCP 只作为 URL 占位和诊断项保存，能力页会明确标记建设中。MCP 卡片会显示 OK/WARN/ERROR 诊断结果，并支持对 stdio 手动刷新静态诊断、协议握手和工具列表预览。</p>
          </section>
          <section>
            <h3>命令映射</h3>
            <p>Bot 编辑弹窗中的“命令映射”可新增 <code>/xxx</code>，并绑定到某个 Skill、stdio MCP、套件、Workflow 或可执行自定义应用。命令名只建议使用小写字母、数字、短横线和下划线。</p>
            <p>Skill 命令会把请求路由给目标 Skill；MCP 命令会聚焦调用目标 stdio MCP；套件命令会把对应套件说明和工作流注入 Agent；Workflow 命令会按选定工作流执行，声明了 steps 时会顺序执行各步骤；自定义应用命令会直接执行 <code>node</code> 或受控 <code>executable</code> 应用。HTTP/SSE MCP 和建设中的自定义应用入口不会出现在目标列表中。保留命令 <code>/new</code>、<code>/continue</code>、<code>/owner</code> 和 <code>/help</code> 不能占用，命令配置区会提示命令名和别名冲突。</p>
            <p><strong>Prompt 模板</strong>可选，使用 <code>{{args}}</code> 引用命令参数，例如把 <code>/ppt 周报</code> 转成固定格式 prompt。</p>
          </section>
          <section>
            <h3>定时任务</h3>
            <p>Bot 编辑弹窗中的“定时任务”支持按 Bot 配置本机调度任务。当前支持 <code>interval</code>、<code>daily</code>、<code>weekly</code> 和 <code>cron</code> 四种计划类型。</p>
            <p><code>cron</code> 使用 5 段表达式：分钟 小时 日 月 周，支持 <code>*</code>、列表、范围和步进，例如 <code>15 9 * * 1-5</code> 表示工作日 09:15，<code>*/30 8-20 * * *</code> 表示每天 08:00 到 20:59 每 30 分钟。</p>
            <p>任务目标可选 <code>agent</code>、<code>command</code>、<code>capability</code>。命令目标会复用该 Bot 已启用的命令映射；能力目标当前支持 Skill、stdio MCP、套件、Workflow，以及声明 <code>scheduledCallable</code> 且入口可执行的自定义应用。</p>
            <p>定时任务结果会投递到指定 <code>chat_id</code>。任务只在应用运行期间触发，并与普通消息共享并发上限；应用启动后发现已到期任务会尽快触发一次。已保存且启用的任务可在 Bot 编辑弹窗或“定时任务”页立即运行；计划触发失败时可按配置重试并向投递 chat 发送失败告警，超过上限后会暂停自动排期并展示暂停原因；最近运行结果可在“定时任务”页和“存储管理”的定时任务运行历史中查看，并可按 Bot 和状态筛选。</p>
          </section>
          <section>
            <h3>运行台</h3>
            <p>运行台显示在线 Bot、可用 Skills、运行中任务和排队任务。点击 Bot 可查看该 Bot 的独立日志，并按日志等级筛选。</p>
            <p>收到 IM 消息后，应用会尽量给原消息添加处理中标记；平台不支持时会静默跳过。处理完成后回复结果。多人同时提问时，超出并发上限的任务会排队。</p>
            <p>如果某个群成员 @ 飞书机器人后只看到平台提示“需要机器人主人的允许”，且运行台没有“收到飞书消息”，说明消息未到达 QuarkfanTools，本地监听和模型不会参与处理。请检查飞书应用是否已发布，且可用范围包含该群成员或所在组织。</p>
          </section>
          <section>
            <h3>飞书资料与文件</h3>
            <p>搜索、读取飞书文档、Wiki、云盘和云 PPT 使用用户态授权。云 PPT 属于 slides 文档，需要导出为 PPTX 后再预览或分析。</p>
            <p>如果日志或回复提示缺少 scope，把缺少的权限加入 Bot 的“用户态 OAuth 额外权限”，保存后重新授权；同时确认飞书开放平台已经给应用开通该权限。</p>
            <p>当 Agent 需要下载云盘文件或导出云文档继续分析时，应通过受控缓存协议交给主进程处理。主进程会先查应用级文件缓存，未命中才调用飞书下载或导出，并把当前会话可访问的本地文件路径交回 Agent。运行时会拦截裸调 <code>lark-cli drive +download</code> 或 <code>drive +export</code> 的 Bash 操作。</p>
          </section>
          <section>
            <h3>存储管理</h3>
            <p>存储管理将会话上下文和文件缓存分开。会话数据包含连续会话 workspace、Claude 会话记录和消息附件；点击会话可查看 Claude session、接收消息、Agent 可观察工作过程、长任务提示、最终回复和文件清单。</p>
            <p>文件缓存位于应用级内容哈希缓存中，用于复用飞书消息附件、受控 helper 下载或导出的飞书文件，以及 Agent 生成文件。存储管理会只读展示缓存索引、新鲜度状态，可按 Bot 和来源筛选，并提供索引校验修复，但不会暴露全局缓存目录路径。带缓存时间的索引超过 90 天会自动失效；清理缓存不会删除会话记录，清理会话也不会删除应用配置、飞书授权、Skill 市场配置或用户导入 Skills。</p>
            <p>定时任务运行历史读取各 Bot 的 <code>scheduled-runs.jsonl</code>，展示最近运行状态、耗时和详情。它是只读审计信息，不会被会话清理或文件缓存清理删除。</p>
          </section>
          <section>
            <h3>版本与帮助</h3>
            <p>左下角版本号可查看更新记录。配置项旁边的 <code>?</code> 可打开单项说明。左上角 Logo 可随时重新打开本手册。</p>
          </section>
        </div>
      </section>
    </div>
  `;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function runStatusLabel(status: ScheduledTaskRunSummary["status"]): string {
  return status === "success" ? "成功" : status === "failed" ? "失败" : "跳过";
}

function runDurationMs(run: ScheduledTaskRunSummary): number {
  const started = Date.parse(run.startedAt);
  const finished = Date.parse(run.finishedAt);
  return Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function filteredScheduledRuns(): ScheduledTaskRunSummary[] {
  return scheduledRuns.filter((run) => (
    (runHistoryBotFilter === "all" || run.botId === runHistoryBotFilter) &&
    (runHistoryStatusFilter === "all" || run.status === runHistoryStatusFilter)
  ));
}

function filteredCacheEntries(): StorageStats["cacheEntries"] {
  return storage.cacheEntries.filter((entry) => (
    (cacheBotFilter === "all" || entry.botIds.includes(cacheBotFilter)) &&
    (cacheSourceFilter === "all" || entry.sourceType === cacheSourceFilter)
  ));
}

function renderStorage(): string {
  const visibleRuns = filteredScheduledRuns();
  const visibleCacheEntries = filteredCacheEntries();
  return `
    <section class="metrics">
      <article><span>总存储占用</span><strong>${formatBytes(storage.totalBytes)}</strong></article>
      <article><span>会话数据</span><strong>${formatBytes(storage.conversationBytes)}</strong></article>
      <article><span>文件缓存</span><strong>${formatBytes(storage.cacheBytes)}</strong></article>
      <article><span>自定义应用产物</span><strong>${formatBytes(storage.customAppArtifactBytes)}</strong></article>
    </section>
    ${pageTabs([
      { id: "cleanup", label: "清理动作", meta: "会话/缓存/产物" },
      { id: "sessions", label: "会话", meta: `${storage.sessions.length} 个` },
      { id: "cache", label: "文件缓存", meta: `${storage.cacheEntries.length} 条` },
      { id: "artifacts", label: "应用产物", meta: `${storage.customAppArtifactCount} 个` },
      { id: "runs", label: "定时历史", meta: `${scheduledRuns.length} 条` }
    ], activeStorageSection, "data-storage-section")}
    <section class="storage-grid page-tab-panel ${activeStorageSection === "cleanup" ? "active" : ""}">
      <div class="panel storage-card">
        <div class="panel-title"><span>EXPIRED SESSION CLEANUP</span><small>24 小时无活动</small></div>
        <p>清理已过期会话的独立 workspace、消息附件和 Claude 会话记录。不会删除机器人配置、飞书授权或用户导入的 Skills。</p>
        <button class="ghost" id="clear-expired" ${storage.expiredSessionCount === 0 ? "disabled" : ""}>清理 ${storage.expiredSessionCount} 个过期会话</button>
      </div>
      <div class="panel storage-card">
        <div class="panel-title"><span>FILE CACHE</span><small>${formatBytes(storage.cacheBytes)}</small></div>
        <p>清理应用级内容哈希缓存。缓存用于复用飞书下载的大文件和 Agent 生成文件；清理后不会删除会话记录，但后续需要时会重新下载或生成。</p>
        <div class="form-actions inline-actions"><button class="ghost" id="repair-file-cache" ${storage.cacheBytes === 0 ? "disabled" : ""}>校验缓存索引</button><button class="ghost" id="clear-file-cache" ${storage.cacheBytes === 0 ? "disabled" : ""}>清理文件缓存</button></div>
      </div>
      <div class="panel storage-card">
        <div class="panel-title"><span>CUSTOM APP ARTIFACTS</span><small>${storage.customAppArtifactCount} workspaces</small></div>
        <p>清理自定义应用运行产物，例如微信读取流程生成的窗口截图和临时识别文件。清理不会删除本地自定义应用、内置模板、Bot 配置或能力授权。</p>
        <div class="form-actions inline-actions"><button class="ghost" id="clear-expired-custom-app-artifacts" ${storage.expiredCustomAppArtifactCount === 0 ? "disabled" : ""}>清理 ${storage.expiredCustomAppArtifactCount} 个过期产物</button><button class="ghost" id="clear-custom-app-artifacts" ${storage.customAppArtifactCount === 0 ? "disabled" : ""}>清理全部应用产物</button></div>
      </div>
      <div class="panel storage-card danger-zone">
        <div class="panel-title"><span>ALL SESSION DATA</span><small>不可恢复</small></div>
        <p>清理全部会话上下文、workspace 和已下载消息附件。文件缓存需单独清理；机器人配置、飞书授权与用户 Skills 会保留。</p>
        <button class="danger" id="clear-all-storage">清理全部会话数据</button>
      </div>
    </section>
    <section class="page-tab-panel ${activeStorageSection === "sessions" ? "active" : ""}">
      <div class="panel storage-card session-selector">
        <div class="panel-title"><span>SELECT SESSION CLEANUP</span><small>${storage.sessions.length} sessions</small></div>
        <div class="session-list">
          ${storage.sessions.map((session) => `
            <div class="check session-row" data-view-session="${escapeHtml(session.id)}">
              <input type="checkbox" data-session-id="${escapeHtml(session.id)}" />
              <span><strong>${escapeHtml(snapshot.config.bots.find((bot) => bot.id === session.botId)?.name || session.botId)}</strong><small>${escapeHtml(session.conversationKey)} / ${new Date(session.updatedAt).toLocaleString()} / ${formatBytes(session.bytes)}${session.expired ? " / 已过期" : ""}</small></span>
              <button class="ghost session-view" data-id="${escapeHtml(session.id)}">查看</button>
            </div>`).join("") || `<div class="empty">当前没有连续会话存储。</div>`}
        </div>
        <button class="ghost" id="clear-selected" ${storage.sessions.length === 0 ? "disabled" : ""}>清理所选会话</button>
      </div>
    </section>
    <section class="panel scheduled-runs-panel page-tab-panel ${activeStorageSection === "artifacts" ? "active" : ""}">
      <div class="panel-title"><span>CUSTOM APP ARTIFACT INDEX</span><small>${storage.customAppArtifactCount} app workspaces</small></div>
      <div class="run-history-list cache-entry-list">
        ${storage.customAppArtifacts.slice(0, 50).map((entry) => `
          <article class="run-history-row cache-entry-row">
            <div class="run-status cache">${entry.expired ? "EXPIRED" : "APP"}</div>
            <div>
              <strong>${escapeHtml(entry.appId)}</strong>
              <p>${escapeHtml(snapshot.config.bots.find((bot) => bot.id === entry.botId)?.name || entry.botId)} / ${escapeHtml(entry.conversationKey)} / ${formatBytes(entry.bytes)} / ${entry.fileCount} files</p>
              <small>${entry.updatedAt ? `updated ${escapeHtml(new Date(entry.updatedAt).toLocaleString())}` : "unknown update time"}${entry.expired ? " / 已过期" : ""}</small>
            </div>
          </article>`).join("") || `<div class="empty">当前没有自定义应用运行产物。微信截图和自定义应用临时文件会在执行后显示在这里。</div>`}
      </div>
    </section>
    <section class="panel scheduled-runs-panel page-tab-panel ${activeStorageSection === "cache" ? "active" : ""}">
      <div class="panel-title"><span>FILE CACHE INDEX</span><small>${visibleCacheEntries.length} / ${storage.cacheEntries.length} entries</small></div>
      <div class="run-history-toolbar">
        <select id="cache-bot-filter">
          <option value="all" ${cacheBotFilter === "all" ? "selected" : ""}>全部 Bot</option>
          ${snapshot.config.bots.map((bot) => `<option value="${escapeHtml(bot.id)}" ${cacheBotFilter === bot.id ? "selected" : ""}>${escapeHtml(bot.name || bot.id)}</option>`).join("")}
        </select>
        <select id="cache-source-filter">
          <option value="all" ${cacheSourceFilter === "all" ? "selected" : ""}>全部来源</option>
          <option value="lark-message-resource" ${cacheSourceFilter === "lark-message-resource" ? "selected" : ""}>消息附件</option>
          <option value="lark-drive-file" ${cacheSourceFilter === "lark-drive-file" ? "selected" : ""}>云盘文件</option>
          <option value="lark-drive-export" ${cacheSourceFilter === "lark-drive-export" ? "selected" : ""}>云文档导出</option>
        </select>
      </div>
      <div class="run-history-list cache-entry-list">
        ${visibleCacheEntries.map((entry) => `
          <article class="run-history-row cache-entry-row">
            <div class="run-status cache">${escapeHtml(cacheSourceShortLabel(entry.sourceType))}</div>
            <div>
              <strong>${escapeHtml(entry.fileName)}</strong>
              <p>${escapeHtml(cacheSourceLabel(entry.sourceType))} / ${formatBytes(entry.bytes)} / ${escapeHtml(entry.botIds.map((botId) => snapshot.config.bots.find((bot) => bot.id === botId)?.name || botId).join("、") || "未关联 Bot")}</p>
              <small>${escapeHtml(entry.label)}${entry.freshnessKey ? ` / ${escapeHtml(entry.freshnessKey)}` : ""}${entry.cachedAt ? ` / cached ${escapeHtml(new Date(entry.cachedAt).toLocaleDateString())}` : ""}</small>
              <small class="diagnostic-line ${escapeHtml(entry.freshness.status)}">${escapeHtml(cacheFreshnessLabel(entry.freshness))}</small>
            </div>
            <button type="button" class="danger compact remove-cache-entry" data-cache-key="${escapeHtml(entry.cacheKey)}">删除缓存</button>
          </article>`).join("") || `<div class="empty">${storage.cacheEntries.length === 0 ? "当前没有可展示的文件缓存索引。消息附件或受控文件 helper 命中后会在这里出现。" : "当前筛选条件下没有缓存索引。"}</div>`}
      </div>
    </section>
    <div class="page-tab-panel ${activeStorageSection === "runs" ? "active" : ""}">${renderScheduledRunHistory(visibleRuns)}</div>
  `;
}

function renderScheduledRunHistory(visibleRuns = filteredScheduledRuns()): string {
  return `
    <section class="panel scheduled-runs-panel">
      <div class="panel-title"><span>SCHEDULED RUN HISTORY</span><small>${visibleRuns.length} / ${scheduledRuns.length} recent runs</small></div>
      <div class="run-history-toolbar">
        <select id="run-history-bot">
          <option value="all" ${runHistoryBotFilter === "all" ? "selected" : ""}>全部 Bot</option>
          ${snapshot.config.bots.map((bot) => `<option value="${escapeHtml(bot.id)}" ${runHistoryBotFilter === bot.id ? "selected" : ""}>${escapeHtml(bot.name || bot.id)}</option>`).join("")}
        </select>
        <select id="run-history-status">
          <option value="all" ${runHistoryStatusFilter === "all" ? "selected" : ""}>全部状态</option>
          <option value="success" ${runHistoryStatusFilter === "success" ? "selected" : ""}>成功</option>
          <option value="failed" ${runHistoryStatusFilter === "failed" ? "selected" : ""}>失败</option>
          <option value="skipped" ${runHistoryStatusFilter === "skipped" ? "selected" : ""}>跳过</option>
        </select>
      </div>
      <div class="run-history-list">
        ${visibleRuns.map((run, index) => `
          <article class="run-history-row ${escapeHtml(run.status)}">
            <div class="run-status ${escapeHtml(run.status)}">${runStatusLabel(run.status)}</div>
            <div>
              <strong>${escapeHtml(run.taskName)}</strong>
              <p>${escapeHtml(run.botName)} / ${new Date(run.startedAt).toLocaleString()} / ${formatDuration(runDurationMs(run))}</p>
              <small>${escapeHtml(run.detail ? run.detail.replace(/\s+/g, " ").slice(0, 140) : "无运行详情。")}${run.detail && run.detail.length > 140 ? "..." : ""}</small>
            </div>
            <button type="button" class="ghost compact run-detail-view" data-run-index="${index}">详情</button>
          </article>`).join("") || `<div class="empty">${scheduledRuns.length === 0 ? "当前没有定时任务运行记录。任务触发后会显示最近运行状态和 Workflow 步骤摘要。" : "当前筛选条件下没有运行记录。"}</div>`}
      </div>
    </section>
  `;
}

function renderScheduledCenter(): string {
  const tasks = snapshot.config.bots.flatMap((bot) => (bot.scheduledTasks ?? []).map((task) => ({ bot, task })));
  const enabled = tasks.filter((item) => item.task.enabled).length;
  const paused = tasks.filter((item) => item.task.pausedReason).length;
  const failed = tasks.filter((item) => item.task.lastStatus === "failed").length;
  return `
    <section class="metrics">
      <article><span>定时任务</span><strong>${tasks.length}</strong></article>
      <article><span>启用</span><strong>${enabled}</strong></article>
      <article><span>失败</span><strong>${failed}</strong></article>
      <article><span>暂停</span><strong>${paused}</strong></article>
    </section>
    ${pageTabs([
      { id: "tasks", label: "任务列表", meta: `${tasks.length} 个` },
      { id: "runs", label: "运行历史", meta: `${scheduledRuns.length} 条` }
    ], activeScheduledSection, "data-scheduled-section")}
    <section class="panel scheduled-runs-panel page-tab-panel ${activeScheduledSection === "tasks" ? "active" : ""}">
      <div class="panel-title"><span>SCHEDULED TASKS</span><small>${enabled} enabled</small></div>
      <div class="scheduled-task-list">
        ${tasks.map(({ bot, task }, index) => `
          <article class="scheduled-task-list-row">
            <div>
              <strong>${escapeHtml(task.name)}</strong>
              <small>${escapeHtml(bot.name || bot.id)} / ${task.enabled ? "启用" : "停用"} / ${escapeHtml(scheduledTaskScheduleText(task))} / ${escapeHtml(scheduledTaskTargetText(task))}</small>
              <small>投递：${escapeHtml(task.delivery.chatId || "未配置")} / 下次：${escapeHtml(task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : "未计划")} / 上次：${escapeHtml(task.lastStatus ? runStatusLabel(task.lastStatus) : "未运行")}</small>
              ${(task.failureCount ?? 0) > 0 || task.retryAt || task.pausedReason ? `<small>治理：失败 ${escapeHtml(String(task.failureCount ?? 0))} 次${task.retryAt ? ` / 重试 ${escapeHtml(new Date(task.retryAt).toLocaleString())}` : ""}${task.pausedReason ? ` / 暂停：${escapeHtml(task.pausedReason)}` : ""}</small>` : ""}
            </div>
            <div class="scheduled-task-list-actions">
              <button type="button" class="ghost compact run-scheduled-task" data-bot-id="${escapeHtml(bot.id)}" data-task-id="${escapeHtml(task.id)}" ${task.enabled ? "" : "disabled"}>立即执行</button>
              <button type="button" class="ghost compact scheduled-edit-bot" data-bot-id="${escapeHtml(bot.id)}" data-task-id="${escapeHtml(task.id)}" data-task-index="${index}">编辑</button>
            </div>
          </article>`).join("") || `<div class="empty">当前没有定时任务。进入配置页打开 Bot 后可以新增。</div>`}
      </div>
    </section>
    <div class="page-tab-panel ${activeScheduledSection === "runs" ? "active" : ""}">${renderScheduledRunHistory()}</div>
  `;
}

function cacheSourceLabel(sourceType: StorageStats["cacheEntries"][number]["sourceType"]): string {
  if (sourceType === "lark-message-resource") return "消息附件";
  if (sourceType === "lark-drive-export") return "云文档导出";
  return "云盘文件";
}

function cacheSourceShortLabel(sourceType: StorageStats["cacheEntries"][number]["sourceType"]): string {
  if (sourceType === "lark-message-resource") return "MSG";
  if (sourceType === "lark-drive-export") return "EXP";
  return "DRV";
}

function cacheFreshnessLabel(freshness: StorageStats["cacheEntries"][number]["freshness"]): string {
  const prefix = freshness.status === "fresh" ? "新鲜度 OK" : freshness.status === "stale" ? "可能过期" : "新鲜度未知";
  return `${prefix} / ${freshness.reason}`;
}

function renderConsole(): string {
  const selectedBot = snapshot.config.bots.find((bot) => bot.id === selectedBotId) ?? snapshot.config.bots[0];
  if (selectedBot && selectedBotId !== selectedBot.id) selectedBotId = selectedBot.id;
  const botLogs = selectedBot
    ? logs.filter((entry) => entry.botId === selectedBot.id && (logLevel === "all" || entry.level === logLevel))
    : [];
  return `
    <section class="metrics">
      <article><span>在线机器人</span><strong>${statusDot(snapshot.connectedBotIds.length > 0)}${snapshot.connectedBotIds.length}/${snapshot.config.bots.filter((bot) => bot.enabled).length}</strong></article>
      <article><span>可用能力</span><strong>${snapshot.capabilities.length}</strong></article>
      <article><span>运行中任务</span><strong>${snapshot.activeTasks}</strong></article>
      <article><span>排队任务 / 模型</span><strong>${snapshot.queuedTasks} / ${escapeHtml(snapshot.config.model.model || "未配置")}</strong></article>
    </section>
    ${pageTabs([
      { id: "bots", label: "机器人", meta: `${snapshot.config.bots.length} 个` },
      { id: "logs", label: "执行日志", meta: `${botLogs.length} 条` }
    ], activeConsoleSection, "data-console-section")}
    <section class="workspace">
      <div class="panel skill-panel page-tab-panel ${activeConsoleSection === "bots" ? "active" : ""}">
        <div class="panel-title"><span>BOT REGISTRY</span><small>${snapshot.config.bots.length} configured</small></div>
        <div class="skill-list bot-registry">
          ${snapshot.config.bots.map((bot) => `
            <div class="skill bot-runtime-card ${selectedBot?.id === bot.id ? "selected" : ""}" data-select-bot="${escapeHtml(bot.id)}">
              <div class="skill-glyph">${escapeHtml(bot.name.slice(0, 2).toUpperCase())}</div>
              <div class="bot-runtime-main">
                <strong>${statusDot(snapshot.connectedBotIds.includes(bot.id))}${escapeHtml(bot.name)}</strong>
                <p>${bot.skillNames.length} 个 Skill / ${bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0} 个能力引用 / ${snapshot.runningBotIds.includes(bot.id) ? "监听中" : botCanStart(bot) ? "未启动" : botStartBlockReason(bot)}</p>
              </div>
              ${snapshot.runningBotIds.includes(bot.id)
                ? `<button class="danger bot-stop" data-id="${escapeHtml(bot.id)}">停止</button>`
                : `<button class="primary bot-start" data-id="${escapeHtml(bot.id)}" ${botCanStart(bot) ? "" : "disabled"} title="${escapeHtml(botCanStart(bot) ? "启动监听" : botStartBlockReason(bot))}">启动</button>`}
            </div>`).join("") || `<div class="empty">前往配置页添加机器人。</div>`}
        </div>
      </div>
      <div class="panel log-panel page-tab-panel ${activeConsoleSection === "logs" ? "active" : ""}">
        <div class="panel-title log-title">
          <span>${selectedBot ? `${escapeHtml(selectedBot.name)} / EXECUTION LOG` : "EXECUTION LOG"}</span>
          <div class="log-controls">
            <select id="log-level">
              <option value="all" ${logLevel === "all" ? "selected" : ""}>全部等级</option>
              <option value="info" ${logLevel === "info" ? "selected" : ""}>信息</option>
              <option value="success" ${logLevel === "success" ? "selected" : ""}>成功</option>
              <option value="warn" ${logLevel === "warn" ? "selected" : ""}>警告</option>
              <option value="error" ${logLevel === "error" ? "selected" : ""}>错误</option>
            </select>
            <small>${botLogs.length} events</small>
          </div>
        </div>
        <div class="logs">
          ${botLogs.slice().reverse().map((entry) => `
            <div class="log ${entry.level}">
              <time>${new Date(entry.time).toLocaleTimeString()}</time>
              <div><strong>${escapeHtml(entry.message)}</strong>${entry.detail ? `<pre>${escapeHtml(entry.detail)}</pre>` : ""}</div>
            </div>`).join("") || `<div class="empty">${selectedBot ? "当前筛选条件下没有该机器人的日志。" : "请先配置机器人。"}</div>`}
        </div>
      </div>
    </section>
  `;
}

function field(label: string, name: string, value: string, type = "text", note = "", helpTopic = name): string {
  return `<label><span>${label}${helpButton(helpTopic)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" />${note ? `<small>${note}</small>` : ""}</label>`;
}

function botField(bot: BotConfig, label: string, fieldName: keyof BotConfig, type = "text", helpTopic = String(fieldName)): string {
  return `<label><span>${label}${helpButton(helpTopic)}</span><input data-edit-bot-field="${fieldName}" type="${type}" value="${escapeHtml(bot[fieldName])}" /></label>`;
}

function botTextarea(bot: BotConfig, label: string, fieldName: keyof BotConfig, note = "", helpTopic = String(fieldName)): string {
  const value = Array.isArray(bot[fieldName]) ? (bot[fieldName] as string[]).join("\n") : String(bot[fieldName] ?? "");
  return `<label><span>${label}${helpButton(helpTopic)}</span><textarea data-edit-bot-field="${fieldName}" rows="3">${escapeHtml(value)}</textarea>${note ? `<small>${note}</small>` : ""}</label>`;
}

function renderBotEditor(): string {
  const bot = snapshot.config.bots.find((item) => item.id === editingBotId);
  if (!bot) return "";
  const editingTask = bot.scheduledTasks?.find((task) => task.id === editingScheduledTaskId);
  const commandConflicts = commandBindingConflicts(bot);
  const provider = bot.provider ?? "lark";
  const botEditorSections: Array<{ id: BotEditorSection; label: string; detail: string; count?: string }> = [
    { id: "basic", label: "基础", detail: "名称、启用、提示" },
    { id: "platform", label: "平台", detail: "飞书身份、OAuth、连接器" },
    { id: "delivery", label: "投递", detail: "结果路由", count: String(bot.deliveryRoutes?.length ?? 0) },
    { id: "skills", label: "Skills", detail: "Skill 授权", count: String(bot.skillNames.length) },
    { id: "capabilities", label: "能力", detail: "MCP、应用、套件", count: String(bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0) },
    { id: "commands", label: "命令", detail: "/xxx 映射", count: String(bot.commandBindings?.length ?? 0) },
    { id: "scheduled", label: "定时", detail: "任务与投递", count: String(bot.scheduledTasks?.length ?? 0) }
  ];
  const sectionClass = (section: BotEditorSection) => `bot-editor-section ${activeBotEditorSection === section ? "active" : ""}`;
  return `
    <div class="modal-backdrop" id="bot-editor-backdrop">
      <section class="release-modal bot-editor-modal" role="dialog" aria-modal="true" data-provider="${escapeHtml(provider)}">
        <div class="release-modal-header">
          <div>
            <p class="eyebrow">BOT CONFIGURATION</p>
            <h2>${escapeHtml(bot.name || "未命名机器人")}</h2>
          </div>
          <button type="button" class="ghost" id="close-bot-editor">关闭</button>
        </div>
        <form id="bot-editor-form" class="bot-editor-shell" data-active-section="${activeBotEditorSection}">
          <aside class="bot-editor-nav" aria-label="Bot 配置分组">
            ${botEditorSections.map((section) => `
              <button type="button" class="${activeBotEditorSection === section.id ? "active" : ""}" data-bot-editor-section="${section.id}">
                <span>${escapeHtml(section.label)}</span>
                ${section.count ? `<strong>${escapeHtml(section.count)}</strong>` : ""}
                <small>${escapeHtml(section.detail)}</small>
              </button>`).join("")}
          </aside>
          <div class="bot-editor-body">
      <section class="${sectionClass("basic")}" data-bot-editor-panel="basic">
      <div class="field-row">
        ${botField(bot, "机器人名称", "name", "text", "botName")}
        <label><span>启用${helpButton("botEnabled")}</span><select data-edit-bot-field="enabled"><option value="true" ${bot.enabled ? "selected" : ""}>启用</option><option value="false" ${!bot.enabled ? "selected" : ""}>停用</option></select></label>
      </div>
      <div class="field-row">
        ${botField(bot, "长任务提示秒数", "longTaskNoticeSeconds", "number")}
        ${botField(bot, "长任务提示文案", "longTaskNoticeText", "text")}
      </div>
      <label><span>向用户展示工作过程${helpButton("showProgress")}</span><select data-edit-bot-field="showProgress"><option value="false" ${!bot.showProgress ? "selected" : ""}>关闭</option><option value="true" ${bot.showProgress ? "selected" : ""}>开启</option></select><small>展示工具调用和检索进度，不泄露模型私有推理。</small></label>
      <small class="bot-note">Agent 无法解决或需要人工授权时，会私聊此用户发送卡片。Owner 必须在飞书中有该应用的使用权限。</small>
      </section>
      <section class="${sectionClass("platform")}" data-bot-editor-panel="platform">
      <label><span>消息平台${helpButton("imProvider")}</span><select data-edit-bot-field="provider" id="bot-provider-select">
        <option value="lark" ${provider === "lark" ? "selected" : ""}>飞书</option>
        <option value="wecom" ${bot.provider === "wecom" ? "selected" : ""} disabled>企业微信（暂时封闭）</option>
        <option value="dingtalk" ${bot.provider === "dingtalk" ? "selected" : ""} disabled>钉钉（建设中）</option>
      </select><small>消息入口和默认回复平台。当前仅开放飞书；企业微信因官方能力限制暂时封闭，钉钉仅预留结构，二者不能启动监听。</small></label>
      <div class="provider-section provider-lark">
        <div class="skill-access-heading"><span>飞书主通道</span><small>事件订阅 / 消息回复 / 用户态 OAuth</small></div>
        <small>用于飞书 Bot 收消息、加处理中表情、回复消息和发起用户态 OAuth。每个 Bot 会使用独立 lark-cli HOME。</small>
      </div>
      <div class="provider-section provider-wecom">
        <div class="skill-access-heading"><span>企业微信主通道</span><small>暂时封闭</small></div>
        <div class="config-warning">
          <strong>企业微信能力暂时封闭</strong>
          <small>${escapeHtml(WECOM_PROVIDER_CLOSED_MESSAGE)}</small>
        </div>
        <div class="config-callout is-disabled">
          <strong>企业微信 CLI 缓存初始化已暂停</strong>
          <small>历史配置会保留，但当前版本不会写入 CLI 缓存，也不会启动企业微信轮询或事件桥。</small>
          <div class="form-actions inline-actions"><button type="button" class="ghost init-wecom-cli" data-id="${escapeHtml(bot.id)}" disabled>初始化/刷新企业微信 CLI 缓存</button></div>
          ${wecomInitStatus[bot.id] ? `<small class="inline-status ${escapeHtml(wecomInitStatus[bot.id].level)}">${escapeHtml(wecomInitStatus[bot.id].text)}</small>` : ""}
        </div>
      </div>
      <div class="provider-section provider-dingtalk config-warning">
        <strong>钉钉建设中</strong><small>当前仅保留配置结构，不能启动监听。请选择飞书或企业微信作为主消息平台。</small>
      </div>
      <label><span><span class="provider-copy provider-lark">飞书 App ID</span><span class="provider-copy provider-wecom">企业微信 Bot ID</span><span class="provider-copy provider-dingtalk">钉钉 App Key</span>${helpButton("appId")}</span><input data-edit-bot-field="appId" value="${escapeHtml(bot.appId)}" /></label>
      <label><span><span class="provider-copy provider-lark">飞书 App Secret</span><span class="provider-copy provider-wecom">企业微信 Bot Secret</span><span class="provider-copy provider-dingtalk">钉钉 App Secret</span>${helpButton("appSecret")}</span><input data-edit-bot-field="appSecret" type="password" value="${escapeHtml(bot.appSecret)}" /></label>
      <label class="provider-section provider-wecom"><span>企业微信事件桥命令${helpButton("wecomEventCommand")}</span><textarea id="wecom-event-command" rows="2" disabled placeholder="企业微信能力暂时封闭">${escapeHtml(bot.providerOptions?.eventCommand ?? "")}</textarea><small>企业微信 Provider 暂时封闭；此字段只保留历史值，当前版本不会执行该命令。</small></label>
      <div class="field-row provider-section provider-wecom">
        <label><span>轮询会话类型${helpButton("wecomPollChat")}</span><select id="wecom-poll-chat-type" disabled><option value="2" ${(bot.providerOptions?.pollChatType ?? "2") === "2" ? "selected" : ""}>群聊</option><option value="1" ${bot.providerOptions?.pollChatType === "1" ? "selected" : ""}>单聊</option></select></label>
        <label><span>轮询 Chat ID 列表${helpButton("wecomPollChat")}</span><textarea id="wecom-poll-chat-id" rows="3" disabled placeholder="企业微信轮询暂时封闭">${escapeHtml(bot.providerOptions?.pollChatId ?? "")}</textarea></label>
      </div>
      <div class="provider-section provider-wecom config-callout is-disabled">
        <strong>企业微信聊天列表获取已暂停</strong>
        <small>考虑到企业微信当前官方能力限制，应用不会调用 <code>wecom-cli msg get_msg_chat_list</code>。已保存的监听列表会保留供后续参考。</small>
        <div class="form-actions inline-actions"><button type="button" class="ghost fetch-wecom-chat-list" data-id="${escapeHtml(bot.id)}" disabled>获取聊天列表</button></div>
        ${renderWeComChatListSelector(bot)}
      </div>
      <div class="field-row provider-section provider-wecom">
        <label><span>轮询间隔(ms)</span><input id="wecom-poll-interval-ms" type="number" min="2000" disabled value="${escapeHtml(bot.providerOptions?.pollIntervalMs ?? "5000")}" /></label>
        <label><span>回看窗口(秒)${helpButton("wecomPollWindow")}</span><input id="wecom-poll-window-seconds" type="number" min="10" max="604800" disabled value="${escapeHtml(bot.providerOptions?.pollWindowSeconds ?? "300")}" /></label>
      </div>
      <label class="provider-section provider-wecom"><span>高级轮询 JSON 参数</span><textarea id="wecom-poll-payload" rows="2" disabled placeholder="企业微信轮询暂时封闭">${escapeHtml(bot.providerOptions?.pollPayload ?? "")}</textarea><small>企业微信轮询暂时封闭；此字段只保留历史值。</small></label>
      <div class="field-row provider-section provider-lark">
        <label><span>接收身份${helpButton("receiveIdentity")}</span><select data-edit-bot-field="receiveIdentity"><option value="bot" ${bot.receiveIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.receiveIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
        <label><span>回复身份${helpButton("replyIdentity")}</span><select data-edit-bot-field="replyIdentity"><option value="bot" ${bot.replyIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.replyIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
      </div>
      <div class="provider-section provider-lark">
        ${botField(bot, "处理中表情", "pendingReaction")}
        ${botField(bot, "Owner 飞书 open_id", "ownerOpenId")}
        ${botTextarea(bot, "用户态 OAuth 额外权限", "oauthScopes", "默认会申请 search:docs:read；这里可填写额外 scope，支持空格、逗号或换行分隔，例如 drive:export:readonly、docs:document:export。修改后需重新点击用户态 OAuth。")}
      </div>
      <div class="skill-access provider-section provider-not-lark">
        <div class="skill-access-heading"><span>飞书知识连接器${helpButton("larkConnector")}</span><small>${bot.connectors?.lark?.enabled ? "enabled" : "disabled"}</small></div>
        <small>当消息入口是企业微信时，仍可通过这里配置飞书知识库、云盘文件和云文档导出能力。留空则只使用主消息平台。</small>
        <label class="check"><input type="checkbox" id="lark-connector-enabled" ${bot.connectors?.lark?.enabled ? "checked" : ""}/><span><strong>启用飞书连接器</strong><small>用于跨平台知识检索和结果转发到飞书。</small></span></label>
        <div class="field-row">
          <label><span>飞书 App ID</span><input id="lark-connector-app-id" value="${escapeHtml(bot.connectors?.lark?.appId ?? "")}" /></label>
          <label><span>飞书 App Secret</span><input id="lark-connector-app-secret" type="password" value="${escapeHtml(bot.connectors?.lark?.appSecret ?? "")}" /></label>
        </div>
        <div class="field-row">
          <label><span>飞书 CLI 路径</span><input id="lark-connector-cli-path" value="${escapeHtml(bot.connectors?.lark?.cliPath ?? "")}" placeholder="留空使用内置 lark-cli" /></label>
          <label><span>飞书 Profile</span><input id="lark-connector-profile" value="${escapeHtml(bot.connectors?.lark?.profile ?? "")}" /></label>
        </div>
        <label><span>飞书 OAuth 额外权限</span><textarea id="lark-connector-oauth-scopes" rows="2">${escapeHtml((bot.connectors?.lark?.oauthScopes ?? []).join("\n"))}</textarea></label>
      </div>
      </section>
      <section class="${sectionClass("delivery")}" data-bot-editor-panel="delivery">
      <div class="skill-access">
        <div class="skill-access-heading"><span>结果投递路由${helpButton("deliveryRoutes")}</span><small>${bot.deliveryRoutes?.filter((route) => route.enabled).length ?? 0} enabled</small></div>
        <small>主回复仍回到原消息；这里可把最终结果复制投递到另一个平台 chat，例如企业微信收到问题后同步发送到飞书群。</small>
        <div class="command-binding-list">
          ${(bot.deliveryRoutes ?? []).map((route, index) => `
            <div class="command-binding-row">
              <label><span>路由 ID</span><input data-route-id="${index}" value="${escapeHtml(route.id)}" placeholder="例如 wechat-unread-summary" /></label>
              <label><span>名称</span><input data-route-name="${index}" value="${escapeHtml(route.name ?? "")}" placeholder="例如 同步到飞书群" /></label>
              <label><span>平台</span><select data-route-provider="${index}">
                <option value="lark" ${route.provider === "lark" ? "selected" : ""}>飞书</option>
                <option value="wecom" ${route.provider === "wecom" ? "selected" : ""} disabled>企业微信（暂时封闭）</option>
              </select></label>
              <label><span>启用</span><select data-route-enabled="${index}"><option value="true" ${route.enabled ? "selected" : ""}>启用</option><option value="false" ${!route.enabled ? "selected" : ""}>停用</option></select></label>
              <label class="command-wide"><span>Chat ID</span><input data-route-chat-id="${index}" value="${escapeHtml(route.chatId)}" placeholder="目标平台 chat_id" /></label>
              <button type="button" class="danger remove-delivery-route" data-index="${index}">删除路由</button>
            </div>`).join("") || `<div class="empty">当前没有额外投递路由。</div>`}
        </div>
        <div class="form-actions inline-actions"><button type="button" class="ghost add-delivery-route" data-id="${bot.id}">新增投递路由</button></div>
      </div>
      </section>
      <section class="${sectionClass("skills")}" data-bot-editor-panel="skills">
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的 Skills${helpButton("skillAccess")}</span><small>${bot.skillNames.length} / ${snapshot.skills.length} 已授权</small></div>
        <small>新增 Skill 默认不授权。可搜索后批量授权或取消当前筛选结果。</small>
        <div class="skill-access-controls">
          <input type="search" data-skill-filter="${bot.id}" placeholder="搜索名称或描述" />
          <select data-skill-auth-filter="${bot.id}"><option value="all">全部 Skills</option><option value="authorized">仅已授权</option><option value="unauthorized">仅未授权</option></select>
          <button type="button" class="ghost skill-select-visible" data-id="${bot.id}">授权筛选结果</button>
          <button type="button" class="ghost skill-clear-visible" data-id="${bot.id}">取消筛选结果</button>
        </div>
        <div class="skill-check-list">
          ${snapshot.skills.map((skill) => `<label class="check" data-bot-skill-row="${bot.id}" data-authorized="${bot.skillNames.includes(skill.name)}" data-skill-search="${escapeHtml(`${skill.name} ${skill.description}`.toLowerCase())}"><input type="checkbox" data-edit-bot-skill="${bot.id}" value="${escapeHtml(skill.name)}" ${bot.skillNames.includes(skill.name) ? "checked" : ""}/><span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description || skillSourceLabel(skill.source))} / ${skillSourceLabel(skill.source)}</small></span></label>`).join("") || `<small>请先导入 Skill 文件夹</small>`}
        </div>
      </div>
      </section>
      <section class="${sectionClass("capabilities")}" data-bot-editor-panel="capabilities">
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的 MCP${helpButton("mcpAccess")}</span><small>${bot.capabilityRefs?.filter((ref) => ref.kind === "mcp" && ref.enabled).length ?? 0} / ${snapshot.config.mcpServers.length} 已授权</small></div>
        <small>MCP 服务是全局配置、本机运行的工具能力。勾选后可通过策略决定是否开放给 Agent、命令和定时任务。</small>
        <div class="skill-check-list">
          ${snapshot.config.mcpServers.map((server) => `<label class="check capability-policy-row"><input type="checkbox" data-edit-bot-mcp="${bot.id}" value="${escapeHtml(server.id)}" ${botHasCapability(bot, "mcp", server.id) ? "checked" : ""}/><span><strong>${escapeHtml(server.name)}</strong><small>${escapeHtml(server.id)} / ${escapeHtml(server.transport)} / ${escapeHtml(server.description || (server.transport === "stdio" ? server.command : server.url) || "未提供描述")}</small></span>${capabilityPolicySelect(bot, "mcp", server.id)}</label>`).join("") || `<small>请先在配置页新增 MCP 服务。</small>`}
        </div>
      </div>
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的自定义应用${helpButton("customAppAccess")}</span><small>${bot.capabilityRefs?.filter((ref) => ref.kind === "app" && ref.enabled).length ?? 0} / ${snapshot.customApps.length} 已授权</small></div>
        <small>自定义应用导入后默认不授权。授权只记录 capability 引用，后续命令和定时任务会复用这层治理边界。</small>
        <div class="skill-check-list">
          ${snapshot.customApps.map((customApp) => `<label class="check capability-policy-row"><input type="checkbox" data-edit-bot-app="${bot.id}" value="${escapeHtml(customApp.id)}" ${botHasCapability(bot, "app", customApp.id) ? "checked" : ""}/><span><strong>${escapeHtml(customApp.name)}</strong><small>${escapeHtml(customApp.id)} / ${escapeHtml(customApp.entry.type)} / ${escapeHtml(customAppAvailabilityLabel(customApp))}${customAppExecutable(customApp) ? "" : " / 不会出现在命令或定时任务目标中"}</small></span>${capabilityPolicySelect(bot, "app", customApp.id)}</label>`).join("") || `<small>请先在“能力”页导入自定义应用。</small>`}
        </div>
      </div>
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的套件${helpButton("suiteAccess")}</span><small>${bot.capabilityRefs?.filter((ref) => ref.kind === "suite" && ref.enabled).length ?? 0} / ${snapshot.suites.length} 已授权</small></div>
        <small>套件挂载用于角色化和行业化能力编排，不自动替代底层 Skill、自定义应用或 MCP 授权；套件命令和普通 Agent 只会看到其中已实际授权的子能力。</small>
        <div class="skill-check-list">
          ${snapshot.suites.map((suite) => `<label class="check capability-policy-row"><input type="checkbox" data-edit-bot-suite="${bot.id}" value="${escapeHtml(suite.id)}" ${botHasCapability(bot, "suite", suite.id) ? "checked" : ""}/><span><strong>${escapeHtml(suite.name)}</strong><small>${escapeHtml(suite.id)} / ${escapeHtml(suite.description || "套件")}</small></span>${capabilityPolicySelect(bot, "suite", suite.id)}</label>`).join("") || `<small>请先在“能力”页导入套件。</small>`}
        </div>
      </div>
      </section>
      <section class="${sectionClass("commands")}" data-bot-editor-panel="commands">
      <div class="skill-access">
        <div class="skill-access-heading"><span>命令映射${helpButton("commandBindings")}</span><small>${bot.commandBindings?.filter((binding) => binding.enabled).length ?? 0} enabled</small></div>
        <small>命令会在收到 <code>/xxx 参数</code> 时优先执行，<code>/help</code> 会列出当前 Bot 可用命令。Skill 命令会只把请求交给目标 Skill；MCP 命令会聚焦调用目标 MCP；Suite 命令会在目标套件上下文中执行；Workflow 命令会按工作流 prompt 或 steps 执行；App 命令会直接执行目标自定义应用。</small>
        ${commandConflicts.length > 0 ? `<div class="config-warning"><strong>命令冲突</strong>${commandConflicts.map((item) => `<small>${escapeHtml(item)}</small>`).join("")}</div>` : ""}
        <div class="command-binding-list">
          ${(bot.commandBindings ?? []).map((binding, index) => `
            <div class="command-binding-row">
              <label><span>命令名</span><input data-command-name="${index}" value="${escapeHtml(binding.name)}" placeholder="例如 ppt" /></label>
              <label><span>别名</span><input data-command-aliases="${index}" value="${escapeHtml((binding.aliases ?? []).join(", "))}" placeholder="例如 deck, slides" /></label>
              <label><span>目标</span><select data-command-target="${index}">
                ${commandTargetOptions(bot).map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === `${binding.target.capability.kind}:${binding.target.capability.id}` ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select></label>
              <label><span>启用</span><select data-command-enabled="${index}"><option value="true" ${binding.enabled ? "selected" : ""}>启用</option><option value="false" ${!binding.enabled ? "selected" : ""}>停用</option></select></label>
              <label class="command-wide"><span>说明</span><input data-command-description="${index}" value="${escapeHtml(binding.description ?? "")}" placeholder="在 UI 中说明命令用途" /></label>
              <label class="command-wide"><span>Prompt 模板</span><input data-command-template="${index}" value="${escapeHtml(binding.promptTemplate ?? "")}" placeholder="可选，使用 {{args}} 引用命令参数" /></label>
              <button type="button" class="danger remove-command-binding" data-index="${index}">删除命令</button>
            </div>`).join("") || `<div class="empty">当前没有命令。至少授权一个 Skill 或自定义应用后再新增。</div>`}
        </div>
        <div class="form-actions inline-actions"><button type="button" class="ghost add-command-binding" data-id="${bot.id}" ${commandTargetOptions(bot).length === 0 ? "disabled" : ""}>新增命令</button></div>
      </div>
      </section>
      <section class="${sectionClass("scheduled")}" data-bot-editor-panel="scheduled">
      <div class="skill-access">
        <div class="skill-access-heading"><span>定时任务${helpButton("scheduledTasks")}</span><small>${bot.scheduledTasks?.filter((task) => task.enabled).length ?? 0} enabled</small></div>
        <small>定时任务会在应用运行期间由本机调度执行，并把结果投递到指定 chat_id。支持 interval、daily、weekly 和 cron；命令目标要求先配置并启用对应命令；能力目标支持 Skill、MCP、套件、Workflow 和声明 scheduledCallable 的自定义应用。</small>
        <div class="scheduled-task-list">
          ${(bot.scheduledTasks ?? []).map((task, index) => renderScheduledTaskSummary(bot, task, index)).join("") || `<div class="empty">当前没有定时任务。</div>`}
        </div>
        <div class="form-actions inline-actions"><button type="button" class="ghost add-scheduled-task" data-id="${bot.id}">新增定时任务</button></div>
      </div>
      </section>
      <div class="form-actions bot-editor-actions">
        <button type="button" class="ghost oauth-bot provider-action provider-lark" data-id="${bot.id}">用户态 OAuth</button>
        <button type="button" class="danger remove-bot" data-id="${bot.id}">删除</button>
        <button type="submit" class="primary">保存 Bot 配置</button>
      </div>
          </div>
        </form>
      </section>
      ${editingTask ? renderScheduledTaskEditor(bot, editingTask, (bot.scheduledTasks ?? []).findIndex((task) => task.id === editingTask.id)) : ""}
    </div>
  `;
}

function discardScheduledTaskDraft(taskId: string): void {
  if (!taskId || !draftScheduledTaskIds.has(taskId) || !snapshot) return;
  for (const bot of snapshot.config.bots) {
    bot.scheduledTasks = (bot.scheduledTasks ?? []).filter((task) => task.id !== taskId);
  }
  draftScheduledTaskIds.delete(taskId);
}

function discardAllScheduledTaskDrafts(): void {
  if (draftScheduledTaskIds.size === 0 || !snapshot) return;
  for (const bot of snapshot.config.bots) {
    bot.scheduledTasks = (bot.scheduledTasks ?? []).filter((task) => !draftScheduledTaskIds.has(task.id));
  }
  draftScheduledTaskIds.clear();
}

function renderWeComChatListSelector(bot: BotConfig): string {
  const status = wecomChatListStatus[bot.id];
  if (!status) return "";
  const statusLine = `<small class="inline-status ${escapeHtml(status.level)}">${escapeHtml(status.text)}</small>`;
  if (!status.result || status.result.chats.length === 0) return statusLine;
  const selected = selectedWeComPollingTargets(bot.providerOptions?.pollChatId ?? "");
  return `
    ${statusLine}
    <div class="wecom-chat-list">
      ${status.result.chats.map((chat) => {
        const value = `2:${chat.chatId}`;
        const checked = selected.has(value) || selected.has(chat.chatId);
        const meta = [
          chat.lastMsgTime ? `最后消息 ${chat.lastMsgTime}` : "",
          typeof chat.msgCount === "number" ? `${chat.msgCount} 条` : ""
        ].filter(Boolean).join(" / ");
        return `<label class="check"><input type="checkbox" class="wecom-chat-select" value="${escapeHtml(value)}" ${checked ? "checked" : ""}/><span><strong>${escapeHtml(chat.chatName || chat.chatId)}</strong><small>${escapeHtml(chat.chatId)}${meta ? ` / ${escapeHtml(meta)}` : ""}</small></span></label>`;
      }).join("")}
    </div>
  `;
}

function selectedWeComPollingTargets(value: string): Set<string> {
  return new Set(value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean));
}

function scheduledTaskScheduleText(task: ScheduledTask): string {
  if (task.schedule.type === "interval") return `间隔 / ${task.schedule.everyMinutes ?? 60} 分钟`;
  if (task.schedule.type === "daily") return `每天 / ${task.schedule.timeOfDay ?? "09:00"}`;
  if (task.schedule.type === "weekly") return `每周 / ${task.schedule.timeOfDay ?? "09:00"} / ${(task.schedule.weekdays ?? []).join(",") || "未配置"}`;
  return `Cron / ${task.schedule.cronExpression ?? "未配置"}`;
}

function scheduledTaskTargetText(task: ScheduledTask): string {
  if (task.target.type === "command") return `命令 / ${task.target.commandName ? `/${task.target.commandName}` : "未配置"}`;
  if (task.target.type === "capability") return `能力 / ${task.target.capability ? `${task.target.capability.kind}:${task.target.capability.id}` : "未配置"}`;
  return "Agent";
}

function renderScheduledTaskSummary(bot: BotConfig, task: ScheduledTask, index: number): string {
  return `
    <article class="scheduled-task-list-row">
      <div>
        <strong>${escapeHtml(task.name)}</strong>
        <small>${task.enabled ? "启用" : "停用"} / ${escapeHtml(scheduledTaskScheduleText(task))} / ${escapeHtml(scheduledTaskTargetText(task))}</small>
        <small>投递：${escapeHtml(task.delivery.chatId || "未配置")} / 下次：${escapeHtml(task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : "未计划")}</small>
        ${(task.failureCount ?? 0) > 0 || task.retryAt || task.pausedReason ? `<small>治理：失败 ${escapeHtml(String(task.failureCount ?? 0))} 次${task.retryAt ? ` / 重试 ${escapeHtml(new Date(task.retryAt).toLocaleString())}` : ""}${task.pausedReason ? ` / 暂停：${escapeHtml(task.pausedReason)}` : ""}</small>` : ""}
      </div>
      <div class="scheduled-task-list-actions">
        <button type="button" class="ghost compact run-scheduled-task" data-bot-id="${escapeHtml(bot.id)}" data-task-id="${escapeHtml(task.id)}" ${task.enabled ? "" : "disabled"}>立即执行</button>
        <button type="button" class="ghost compact edit-scheduled-task" data-task-id="${escapeHtml(task.id)}">编辑</button>
        <button type="button" class="danger compact remove-scheduled-task" data-index="${index}">删除</button>
      </div>
    </article>
  `;
}

function renderScheduledTaskEditor(bot: BotConfig, task: ScheduledTask, index: number): string {
  return `
    <div class="modal-backdrop" id="scheduled-task-backdrop">
      <section class="release-modal scheduled-task-modal" data-task-card="${index}" data-schedule-type="${escapeHtml(task.schedule.type)}" data-target-type="${escapeHtml(task.target.type)}">
        <div class="release-modal-header">
          <div><p class="eyebrow">SCHEDULED TASK</p><h2>${escapeHtml(task.name)}</h2></div>
          <button class="ghost release-close" id="close-scheduled-task-editor">关闭</button>
        </div>
        <div class="scheduled-task-editor-body">
          <div class="scheduled-task-header">
            <label><span>任务名</span><input data-task-name="${index}" value="${escapeHtml(task.name)}" placeholder="例如 每日质量日报" /></label>
            <label><span>启用</span><select data-task-enabled="${index}"><option value="true" ${task.enabled ? "selected" : ""}>启用</option><option value="false" ${!task.enabled ? "selected" : ""}>停用</option></select></label>
          </div>
          <div class="scheduled-task-section">
            <strong>计划</strong>
            <div class="scheduled-task-grid">
              <label><span>计划类型</span><select data-task-schedule-type="${index}">
                <option value="interval" ${task.schedule.type === "interval" ? "selected" : ""}>间隔 interval</option>
                <option value="daily" ${task.schedule.type === "daily" ? "selected" : ""}>每天 daily</option>
                <option value="weekly" ${task.schedule.type === "weekly" ? "selected" : ""}>每周 weekly</option>
                <option value="cron" ${task.schedule.type === "cron" ? "selected" : ""}>Cron 表达式</option>
              </select></label>
              <label><span>时区</span><input data-task-timezone="${index}" value="${escapeHtml(task.schedule.timezone)}" placeholder="Asia/Shanghai" /></label>
              <label class="schedule-interval"><span>间隔分钟</span><input data-task-every-minutes="${index}" type="number" min="5" value="${escapeHtml(task.schedule.everyMinutes ?? 60)}" /></label>
              <label class="schedule-daily schedule-weekly"><span>时间点</span><input data-task-time-of-day="${index}" value="${escapeHtml(task.schedule.timeOfDay ?? "09:00")}" placeholder="09:00" /></label>
              <label class="schedule-weekly"><span>周几</span><input data-task-weekdays="${index}" value="${escapeHtml((task.schedule.weekdays ?? [1]).join(","))}" placeholder="0-6，逗号分隔；0=周日" /></label>
              <label class="schedule-cron command-wide"><span>Cron 表达式</span><input data-task-cron-expression="${index}" value="${escapeHtml(task.schedule.cronExpression ?? "15 9 * * 1-5")}" placeholder="15 9 * * 1-5" /><small>5 段：分钟 小时 日 月 周；支持 *、列表、范围和步进。</small></label>
            </div>
          </div>
          <div class="scheduled-task-section">
            <strong>目标</strong>
            <div class="scheduled-task-grid">
              <label><span>目标类型</span><select data-task-target-type="${index}">
                <option value="agent" ${task.target.type === "agent" ? "selected" : ""}>Agent</option>
                <option value="command" ${task.target.type === "command" ? "selected" : ""}>命令</option>
                <option value="capability" ${task.target.type === "capability" ? "selected" : ""}>能力</option>
              </select></label>
              <label class="target-command"><span>命令目标</span><select data-task-command-name="${index}">
                ${scheduledCommandOptions(bot).map((name) => `<option value="${escapeHtml(name)}" ${name === task.target.commandName ? "selected" : ""}>/${escapeHtml(name)}</option>`).join("")}
              </select></label>
              <label class="target-capability"><span>能力目标</span><select data-task-capability="${index}">
                ${scheduledCapabilityOptions(bot).map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === `${task.target.capability?.kind ?? ""}:${task.target.capability?.id ?? ""}` ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select></label>
              <label class="command-wide"><span>Prompt</span><input data-task-prompt="${index}" value="${escapeHtml(task.target.prompt)}" placeholder="输入定时执行时使用的 prompt" /></label>
            </div>
          </div>
          <div class="scheduled-task-section">
            <strong>投递</strong>
            <div class="scheduled-task-grid">
              <label class="command-wide"><span>投递 chat_id</span><input data-task-chat-id="${index}" value="${escapeHtml(task.delivery.chatId)}" placeholder="oc_xxx" /></label>
            </div>
          </div>
          <div class="scheduled-task-section">
            <strong>治理</strong>
            <div class="scheduled-task-grid">
              <label><span>最大重试次数</span><input data-task-max-retries="${index}" type="number" min="0" max="20" value="${escapeHtml(task.retry?.maxRetries ?? 0)}" /><small>0 表示失败后不立即重试。</small></label>
              <label><span>重试延迟分钟</span><input data-task-retry-delay="${index}" type="number" min="1" max="1440" value="${escapeHtml(task.retry?.delayMinutes ?? 10)}" /></label>
              <label class="command-wide"><span>暂停原因</span><input value="${escapeHtml(task.pausedReason ?? "")}" placeholder="暂停自动排期后显示" disabled /></label>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="ghost" id="cancel-scheduled-task-editor">取消</button>
            <button type="button" class="primary" id="save-scheduled-task-editor">保存任务</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function readScheduledTaskFromEditor(bot: BotConfig, index: number): ScheduledTask | null {
  const name = document.querySelector<HTMLInputElement>(`[data-task-name="${index}"]`)?.value.trim() ?? "";
  const scheduleType = (document.querySelector<HTMLSelectElement>(`[data-task-schedule-type="${index}"]`)?.value ?? "daily") as ScheduledTask["schedule"]["type"];
  const timezone = document.querySelector<HTMLInputElement>(`[data-task-timezone="${index}"]`)?.value.trim() || "Asia/Shanghai";
  const prompt = document.querySelector<HTMLInputElement>(`[data-task-prompt="${index}"]`)?.value.trim() || "";
  const chatId = document.querySelector<HTMLInputElement>(`[data-task-chat-id="${index}"]`)?.value.trim() || "";
  const targetType = (document.querySelector<HTMLSelectElement>(`[data-task-target-type="${index}"]`)?.value ?? "agent") as ScheduledTask["target"]["type"];
  const enabled = (document.querySelector<HTMLSelectElement>(`[data-task-enabled="${index}"]`)?.value ?? "true") === "true";
  if (!name || !prompt || !chatId) return null;
  const task = (bot.scheduledTasks ?? [])[index];
  const normalized: ScheduledTask = {
    id: task?.id ?? crypto.randomUUID(),
    botId: bot.id,
    enabled,
    name,
    schedule: {
      type: scheduleType,
      timezone
    },
    target: {
      type: targetType,
      prompt
    },
    delivery: {
      type: "chat",
      chatId
    },
    lastRunAt: task?.lastRunAt,
    nextRunAt: task?.nextRunAt,
    lastStatus: task?.lastStatus,
    failureCount: enabled ? undefined : task?.failureCount,
    retryAt: enabled ? undefined : task?.retryAt,
    pausedReason: enabled ? undefined : task?.pausedReason
  };
  const maxRetries = Math.max(0, Math.min(20, Number(document.querySelector<HTMLInputElement>(`[data-task-max-retries="${index}"]`)?.value ?? 0) || 0));
  const delayMinutes = Math.max(1, Math.min(1440, Number(document.querySelector<HTMLInputElement>(`[data-task-retry-delay="${index}"]`)?.value ?? 10) || 10));
  if (maxRetries > 0) normalized.retry = { maxRetries, delayMinutes };
  if (scheduleType === "interval") normalized.schedule.everyMinutes = Math.max(5, Number(document.querySelector<HTMLInputElement>(`[data-task-every-minutes="${index}"]`)?.value ?? 60) || 60);
  if (scheduleType === "daily" || scheduleType === "weekly") normalized.schedule.timeOfDay = document.querySelector<HTMLInputElement>(`[data-task-time-of-day="${index}"]`)?.value.trim() || "09:00";
  if (scheduleType === "weekly") {
    normalized.schedule.weekdays = [...new Set((document.querySelector<HTMLInputElement>(`[data-task-weekdays="${index}"]`)?.value ?? "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))];
  }
  if (scheduleType === "cron") normalized.schedule.cronExpression = document.querySelector<HTMLInputElement>(`[data-task-cron-expression="${index}"]`)?.value.trim().replace(/\s+/g, " ") || "";
  if (targetType === "command") normalized.target.commandName = document.querySelector<HTMLSelectElement>(`[data-task-command-name="${index}"]`)?.value.trim() || "";
  if (targetType === "capability") {
    const raw = document.querySelector<HTMLSelectElement>(`[data-task-capability="${index}"]`)?.value ?? "";
    const [kind, id] = raw.split(":");
    if (kind && id) normalized.target.capability = { kind: kind as "skill" | "mcp" | "app" | "suite" | "workflow", id };
  }
  return normalized;
}

function renderConfig(): string {
  const c = snapshot.config;
  return `
    <form id="config-form">
      ${pageTabs([
        { id: "model", label: "模型与运行", meta: c.model.model || "未配置模型" },
        { id: "customApps", label: "自定义应用", meta: `${c.runtime.customAppArtifacts?.retentionDays ?? 7} 天产物` },
        { id: "market", label: "Skill 市场", meta: c.skillMarket.enabled ? "已启用" : "停用" },
        { id: "mcp", label: "MCP", meta: `${c.mcpServers.length} 个` },
        { id: "bots", label: "Bot", meta: `${c.bots.length} 个` }
      ], activeConfigSection, "data-config-section")}
      <section class="config-grid">
        <div class="panel config-panel page-tab-panel ${activeConfigSection === "model" ? "active" : ""}">
          <div class="panel-title"><span>MODEL PROVIDER</span><small>Claude Messages API compatible</small></div>
          ${field("Provider 名称", "providerName", c.model.providerName)}
          ${field("Claude Base URL", "baseUrl", c.model.baseUrl, "url", "服务商提供的 Claude / Anthropic 兼容地址")}
          ${field("模型", "model", c.model.model)}
          ${field("API Key", "apiKey", c.model.apiKey, "password")}
          <label><span>最大并发任务数${helpButton("maxConcurrentTasks")}</span><input name="maxConcurrentTasks" type="number" min="1" max="20" value="${c.runtime.maxConcurrentTasks}" /><small>不同会话最多同时运行的 Agent 数量；同一会话仍按顺序处理。</small></label>
          <label><span>单次 Agent 最大步数${helpButton("maxAgentTurns")}</span><input name="maxAgentTurns" type="number" min="10" max="100" value="${c.runtime.maxAgentTurns ?? 60}" /><small>复杂 Skill 或飞书资料检索会消耗更多工具调用步数；默认 60。</small></label>
          <label><span>多模态视觉能力${helpButton("multimodalEnabled")}</span><select name="multimodalEnabled"><option value="true" ${c.model.multimodalEnabled ? "selected" : ""}>启用，允许图片与 PPT 视觉解析</option><option value="false" ${!c.model.multimodalEnabled ? "selected" : ""}>禁用，仅文本模型</option></select><small>PPT Skill 要求启用此能力，否则会拒绝仅凭抽取文字完成解析。</small></label>
          <label><span>界面主题${helpButton("uiTheme")}</span><select name="uiTheme"><option value="system" ${c.ui.theme === "system" ? "selected" : ""}>跟随系统</option><option value="light" ${c.ui.theme === "light" ? "selected" : ""}>浅色</option><option value="dark" ${c.ui.theme === "dark" ? "selected" : ""}>深色</option></select><small>切换应用界面外观，不影响模型、Bot 或权限行为。</small></label>
        </div>
        <div class="panel config-panel page-tab-panel ${activeConfigSection === "customApps" ? "active" : ""}">
          <div class="panel-title"><span>CUSTOM APPS</span><small>Artifacts</small></div>
          <label><span>自定义应用产物自动清理${helpButton("customAppArtifacts")}</span><select name="customAppArtifactsAutoCleanup"><option value="false" ${!c.runtime.customAppArtifacts?.autoCleanup ? "selected" : ""}>关闭，仅手动清理</option><option value="true" ${c.runtime.customAppArtifacts?.autoCleanup ? "selected" : ""}>开启，刷新存储统计时清理过期产物</option></select><small>只清理会话 workspace 下 apps/&lt;app-id&gt; 的运行产物，不删除自定义应用本体。</small></label>
          <label><span>自定义应用产物保留天数${helpButton("customAppArtifacts")}</span><input name="customAppArtifactsRetentionDays" type="number" min="1" max="90" value="${c.runtime.customAppArtifacts?.retentionDays ?? 7}" /><small>用于判断截图、临时文件和调试产物何时过期；范围 1-90 天。</small></label>
          <small>每个自定义应用的回复后处理在“能力 > 自定义应用”点击该应用后的弹窗中配置。</small>
        </div>
        <div class="panel config-panel page-tab-panel ${activeConfigSection === "market" ? "active" : ""}">
          <div class="panel-title"><span>SKILL MARKET</span><small>Built-in Git client / HTTPS</small></div>
          <label><span>启用技能市场${helpButton("marketEnabled")}</span><select name="marketEnabled"><option value="true" ${c.skillMarket.enabled ? "selected" : ""}>启用</option><option value="false" ${!c.skillMarket.enabled ? "selected" : ""}>停用</option></select></label>
          ${field("HTTPS Git 仓库", "marketRepositoryUrl", c.skillMarket.repositoryUrl, "url", "应用内置 Git 客户端，不依赖本机 Git；仅支持 HTTPS URL")}
          ${field("分支", "marketBranch", c.skillMarket.branch)}
          ${field("访问 Token（可选）", "marketToken", c.skillMarket.token, "password", "私有仓库使用；仅保存在本机配置")}
          <div class="form-actions"><button type="button" class="ghost" id="sync-market" ${c.skillMarket.enabled && c.skillMarket.repositoryUrl ? "" : "disabled"}>立即同步技能市场</button></div>
        </div>
        <div class="panel config-panel page-tab-panel ${activeConfigSection === "mcp" ? "active" : ""}">
          <div class="panel-title"><span>MCP SERVERS ${helpButton("mcpServers")}</span><small>${c.mcpServers.length} configured</small></div>
          <div class="command-binding-list config-inline-list">
            ${c.mcpServers.map((server, index) => `
              <div class="command-binding-row">
                <label><span>名称</span><input data-mcp-name="${index}" value="${escapeHtml(server.name)}" placeholder="例如 质量库" /></label>
                <label><span>ID</span><input data-mcp-id="${index}" value="${escapeHtml(server.id)}" placeholder="quality-db" /></label>
                <label><span>传输${helpButton("mcpTransport")}</span><select data-mcp-transport="${index}"><option value="stdio" ${server.transport === "stdio" ? "selected" : ""}>stdio</option><option value="http" ${server.transport === "http" ? "selected" : ""}>HTTP 占位</option><option value="sse" ${server.transport === "sse" ? "selected" : ""}>SSE 占位</option></select></label>
                <label><span>启用</span><select data-mcp-enabled="${index}"><option value="true" ${server.enabled ? "selected" : ""}>启用</option><option value="false" ${!server.enabled ? "selected" : ""}>停用</option></select></label>
                <label class="command-wide"><span>命令${helpButton("mcpCommand")}</span><input data-mcp-command="${index}" value="${escapeHtml(server.command)}" placeholder="node" /></label>
                <label class="command-wide"><span>参数</span><input data-mcp-args="${index}" value="${escapeHtml(server.args.join(" "))}" placeholder="dist/server.js --mode prod" /></label>
                <label class="command-wide"><span>HTTP/SSE URL${helpButton("mcpUrl")}</span><input data-mcp-url="${index}" value="${escapeHtml(server.url ?? "")}" placeholder="https://example.com/mcp" /><small>HTTP/SSE 当前仅保存配置并提示诊断，运行时注入和协议探测待后续验证。</small></label>
                <label class="command-wide"><span>环境变量${helpButton("mcpEnv")}</span><input data-mcp-env="${index}" value="${escapeHtml(server.env.map((item) => `${item.name}=${item.value}`).join("\n"))}" placeholder="TOKEN=xxx" /></label>
                <label><span>超时(ms)</span><input data-mcp-timeout="${index}" type="number" min="1000" value="${escapeHtml(server.timeoutMs ?? "")}" placeholder="5000" /></label>
                <label><span>始终加载</span><select data-mcp-always-load="${index}"><option value="false" ${!server.alwaysLoad ? "selected" : ""}>否</option><option value="true" ${server.alwaysLoad ? "selected" : ""}>是</option></select></label>
                <label class="command-wide"><span>说明</span><input data-mcp-description="${index}" value="${escapeHtml(server.description ?? "")}" placeholder="说明此 MCP 服务用途" /></label>
                <button type="button" class="danger remove-mcp-server" data-index="${index}">删除 MCP</button>
              </div>`).join("") || `<div class="empty">当前没有 MCP 服务。</div>`}
          </div>
          <div class="form-actions inline-actions"><button type="button" class="ghost" id="add-mcp-server">新增 MCP</button></div>
        </div>
        <div class="panel config-panel page-tab-panel ${activeConfigSection === "bots" ? "active" : ""}">
          <div class="panel-title"><span>BOT REGISTRY ${helpButton("botList")}</span><small>${c.bots.length} configured</small></div>
          <div class="config-bot-list">
            ${c.bots.map((bot) => `
              <button type="button" class="config-bot-row" data-edit-bot="${escapeHtml(bot.id)}">
                <span>${statusDot(bot.enabled)}<strong>${escapeHtml(bot.name || "未命名机器人")}</strong></span>
                <small>${escapeHtml(imProviderLabel(bot.provider))} / ${escapeHtml(bot.appId || "未配置 App ID")} / ${bot.skillNames.length} Skills / ${bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0} capability refs / ${bot.oauthScopes?.length ?? 0} extra scopes</small>
              </button>`).join("") || `<div class="empty">还没有机器人。点击下方按钮新增。</div>`}
          </div>
          <div class="form-actions"><button type="button" class="ghost" id="add-bot">新增机器人</button></div>
        </div>
      </section>
      <div class="form-actions"><button type="submit" class="primary">保存配置</button></div>
    </form>
  `;
}

function newBot(): BotConfig {
  return {
    id: crypto.randomUUID(),
    name: `机器人 ${snapshot.config.bots.length + 1}`,
    enabled: true,
    provider: "lark",
    cliPath: "",
    profile: "",
    appId: "",
    appSecret: "",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    providerOptions: {},
    connectors: {},
    deliveryRoutes: [],
    oauthScopes: [],
    skillNames: [],
    capabilityRefs: [],
    commandBindings: [],
    scheduledTasks: [],
    pendingReaction: "OnIt",
    ownerOpenId: "",
    showProgress: false,
    longTaskNoticeSeconds: 0,
    longTaskNoticeText: "这个问题还在处理中，我会继续完成并在结果出来后回复。"
  };
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("#show-manual")?.addEventListener("click", () => {
    showManual = true;
    render();
    document.querySelector<HTMLButtonElement>("#close-manual")?.focus();
  });
  document.querySelector<HTMLButtonElement>("#close-manual")?.addEventListener("click", closeManual);
  document.querySelector<HTMLElement>("#manual-backdrop")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    closeManual();
  });
  document.querySelector<HTMLButtonElement>("#show-release-notes")?.addEventListener("click", () => {
    showReleaseNotes = true;
    render();
    document.querySelector<HTMLButtonElement>("#close-release-notes")?.focus();
  });
  document.querySelector<HTMLButtonElement>("#close-release-notes")?.addEventListener("click", closeReleaseNotes);
  document.querySelector<HTMLElement>("#release-notes-backdrop")?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    closeReleaseNotes();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.onclick = async () => {
      activeView = button.dataset.view as typeof activeView;
      if (activeView === "storage") storage = await window.quarkfanTools.storageStats();
      if (activeView === "scheduled") scheduledRuns = await window.quarkfanTools.scheduledRuns();
      if (activeView === "capabilities") {
        [capabilityAudit, platformDiagnostics] = await Promise.all([
          window.quarkfanTools.capabilityAudit(),
          window.quarkfanTools.platformDiagnostics()
        ]);
      }
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#import-skill")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.importSkill();
    render();
  });
  document.querySelector<HTMLButtonElement>("#import-custom-app")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.importCustomApp();
    render();
  });
  document.querySelector<HTMLButtonElement>("#import-suite")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.importSuite();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-capability-section]").forEach((button) => {
    button.onclick = () => {
      activeCapabilitySection = button.dataset.capabilitySection as CapabilitySection;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-console-section]").forEach((button) => {
    button.onclick = () => {
      activeConsoleSection = button.dataset.consoleSection as typeof activeConsoleSection;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-config-section]").forEach((button) => {
    button.onclick = () => {
      activeConfigSection = button.dataset.configSection as typeof activeConfigSection;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-storage-section]").forEach((button) => {
    button.onclick = () => {
      activeStorageSection = button.dataset.storageSection as typeof activeStorageSection;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-scheduled-section]").forEach((button) => {
    button.onclick = () => {
      activeScheduledSection = button.dataset.scheduledSection as typeof activeScheduledSection;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-market-source-tab]").forEach((button) => {
    button.onclick = () => {
      marketSource = normalizeMarketSource(button.dataset.marketSourceTab);
      render();
    };
  });
  document.querySelector<HTMLInputElement>("#market-search")?.addEventListener("input", (event) => {
    marketSearch = (event.currentTarget as HTMLInputElement).value;
    filterMarketSkills();
  });
  document.querySelectorAll<HTMLElement>("[data-preview-skill]").forEach((row) => {
    row.onclick = async (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const value: SkillPreview = await window.quarkfanTools.skillPreview(String(row.dataset.previewSkill));
      preview = { title: `${value.name} / ${skillSourceLabel(value.source)}`, body: `${value.content}\n\nFILES\n${value.files.join("\n")}` };
      render();
    };
  });
  document.querySelectorAll<HTMLElement>("[data-preview-custom-app]").forEach((row) => {
    row.onclick = async () => {
      const value: CustomAppPreview = await window.quarkfanTools.customAppPreview(String(row.dataset.previewCustomApp));
      preview = { title: `${value.app.name} / ${value.app.id}`, html: renderCustomAppManifestEditor(value) };
      render();
    };
  });
  document.querySelectorAll<HTMLElement>("[data-preview-suite]").forEach((row) => {
    row.onclick = async () => {
      const value: SuitePreview = await window.quarkfanTools.suitePreview(String(row.dataset.previewSuite));
      preview = { title: `${value.suite.name} / ${value.suite.id}`, html: renderSuiteManifestEditor(value) };
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#save-custom-app-manifest")?.addEventListener("click", async () => {
    const id = document.querySelector<HTMLElement>("[data-editor-kind='app']")?.dataset.editorId ?? "";
    const manifestText = document.querySelector<HTMLTextAreaElement>("#manifest-editor-text")?.value ?? "";
    try {
      snapshot = await window.quarkfanTools.saveCustomAppManifest(id, manifestText);
      const value = await window.quarkfanTools.customAppPreview(id);
      preview = { title: `${value.app.name} / ${value.app.id}`, html: renderCustomAppManifestEditor(value) };
    } catch (error) {
      window.alert(String(error instanceof Error ? error.message : error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>("#save-custom-app-processing")?.addEventListener("click", async () => {
    const id = document.querySelector<HTMLElement>("[data-editor-kind='app']")?.dataset.editorId ?? "";
    if (!/^[a-z0-9._-]+$/.test(id)) return;
    const next = structuredClone(snapshot.config);
    next.runtime.customAppReplyProcessing = {
      mode: "raw",
      prompt: "",
      maxInputChars: 12000
    };
    next.runtime.customAppReplyProcessingByApp = {
      ...(next.runtime.customAppReplyProcessingByApp ?? {}),
      [id]: {
        mode: document.querySelector<HTMLSelectElement>("#custom-app-processing-mode")?.value === "summarize" ? "summarize" : "raw",
        prompt: document.querySelector<HTMLTextAreaElement>("#custom-app-processing-prompt")?.value.trim() || "",
        maxInputChars: Math.max(1000, Math.min(60000, Number(document.querySelector<HTMLInputElement>("#custom-app-processing-max-input")?.value ?? 12000) || 12000))
      }
    };
    try {
      snapshot = await window.quarkfanTools.saveConfig(next);
      const value = await window.quarkfanTools.customAppPreview(id);
      preview = { title: `${value.app.name} / ${value.app.id}`, html: renderCustomAppManifestEditor(value) };
    } catch (error) {
      window.alert(String(error instanceof Error ? error.message : error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>("#copy-custom-app-template")?.addEventListener("click", async () => {
    const id = document.querySelector<HTMLElement>("[data-editor-kind='app']")?.dataset.editorId ?? "";
    const newId = document.querySelector<HTMLInputElement>("#manifest-copy-id")?.value.trim() ?? "";
    try {
      snapshot = await window.quarkfanTools.copyCustomAppTemplate(id, newId);
      const value = await window.quarkfanTools.customAppPreview(newId);
      preview = { title: `${value.app.name} / ${value.app.id}`, html: renderCustomAppManifestEditor(value) };
    } catch (error) {
      window.alert(String(error instanceof Error ? error.message : error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>("#save-suite-manifest")?.addEventListener("click", async () => {
    const id = document.querySelector<HTMLElement>("[data-editor-kind='suite']")?.dataset.editorId ?? "";
    const manifestText = document.querySelector<HTMLTextAreaElement>("#manifest-editor-text")?.value ?? "";
    try {
      snapshot = await window.quarkfanTools.saveSuiteManifest(id, manifestText);
      const value = await window.quarkfanTools.suitePreview(id);
      preview = { title: `${value.suite.name} / ${value.suite.id}`, html: renderSuiteManifestEditor(value) };
    } catch (error) {
      window.alert(String(error instanceof Error ? error.message : error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>("#copy-suite-template")?.addEventListener("click", async () => {
    const id = document.querySelector<HTMLElement>("[data-editor-kind='suite']")?.dataset.editorId ?? "";
    const newId = document.querySelector<HTMLInputElement>("#manifest-copy-id")?.value.trim() ?? "";
    try {
      snapshot = await window.quarkfanTools.copySuiteTemplate(id, newId);
      const value = await window.quarkfanTools.suitePreview(newId);
      preview = { title: `${value.suite.name} / ${value.suite.id}`, html: renderSuiteManifestEditor(value) };
    } catch (error) {
      window.alert(String(error instanceof Error ? error.message : error));
    }
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".resource-open-folder").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      const kind = button.dataset.resourceKind as "skill" | "app" | "suite";
      const id = String(button.dataset.resourceId ?? "");
      if (!kind || !id) return;
      await window.quarkfanTools.showResourceInFolder(kind, id);
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".upgrade-custom-app").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      try {
        snapshot = await window.quarkfanTools.upgradeCustomApp();
      } catch (error) {
        window.alert(String(error instanceof Error ? error.message : error));
      }
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-custom-app").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      const id = String(button.dataset.appId ?? "");
      if (!id || !window.confirm(`确认卸载自定义应用“${id}”？应用目录会从本机受管目录删除。`)) return;
      try {
        snapshot = await window.quarkfanTools.removeCustomApp(id);
      } catch (error) {
        window.alert(String(error instanceof Error ? error.message : error));
      }
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".upgrade-suite").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      try {
        snapshot = await window.quarkfanTools.upgradeSuite();
      } catch (error) {
        window.alert(String(error instanceof Error ? error.message : error));
      }
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-suite").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      const id = String(button.dataset.suiteId ?? "");
      if (!id || !window.confirm(`确认卸载套件“${id}”？套件目录会从本机受管目录删除。`)) return;
      try {
        snapshot = await window.quarkfanTools.removeSuite(id);
      } catch (error) {
        window.alert(String(error instanceof Error ? error.message : error));
      }
      render();
    };
  });
  document.querySelector<HTMLSelectElement>("#market-source")?.addEventListener("change", (event) => {
    marketSource = normalizeMarketSource((event.currentTarget as HTMLSelectElement).value);
    filterMarketSkills();
  });
  document.querySelector<HTMLButtonElement>("#market-sync")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.syncSkillMarket();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-local-skill").forEach((button) => {
    button.onclick = async () => {
      const name = String(button.dataset.name);
      if (!window.confirm(`确认删除本地 Skill“${name}”？所有 Bot 对它的授权也会被撤销。`)) return;
      snapshot = await window.quarkfanTools.removeLocalSkill(name);
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-help]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      helpTopicKey = String(button.dataset.help);
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#close-help")?.addEventListener("click", () => { helpTopicKey = ""; render(); });
  document.querySelector<HTMLElement>("#help-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) { helpTopicKey = ""; render(); }
  });
  document.querySelectorAll<HTMLButtonElement>("[data-edit-bot]").forEach((button) => {
    button.onclick = () => {
      const nextEditingBotId = String(button.dataset.editBot);
      if (nextEditingBotId !== editingBotId) {
        botEditorScrollTop = 0;
        activeBotEditorSection = "basic";
      }
      editingBotId = nextEditingBotId;
      render();
    };
  });
  document.querySelectorAll<HTMLElement>("[data-select-bot]").forEach((card) => {
    card.onclick = () => {
      selectedBotId = String(card.dataset.selectBot);
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".bot-start").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      selectedBotId = String(button.dataset.id);
      const bot = snapshot.config.bots.find((item) => item.id === selectedBotId);
      appendLocalLog("info", "正在启动机器人监听", bot?.name ?? selectedBotId, selectedBotId);
      if ((bot?.provider ?? "lark") === "wecom") {
        appendLocalLog("warn", "企业微信 Provider 暂时封闭", WECOM_PROVIDER_CLOSED_MESSAGE, selectedBotId);
        window.alert(WECOM_PROVIDER_CLOSED_MESSAGE);
        render();
        return;
      }
      render();
      try {
        snapshot = await window.quarkfanTools.startBot(selectedBotId);
      } catch (error) {
        appendLocalLog("error", "启动机器人失败", error instanceof Error ? error.message : String(error), selectedBotId);
      }
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".bot-stop").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      selectedBotId = String(button.dataset.id);
      snapshot = await window.quarkfanTools.stopBot(selectedBotId);
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".init-wecom-cli").forEach((button) => {
    button.onclick = async () => {
      const botId = String(button.dataset.id);
      const bot = snapshot.config.bots.find((item) => item.id === botId);
      if ((bot?.provider ?? "lark") === "wecom") {
        appendLocalLog("warn", "企业微信 CLI 缓存初始化已暂停", WECOM_PROVIDER_CLOSED_MESSAGE, botId);
        window.alert(WECOM_PROVIDER_CLOSED_MESSAGE);
        return;
      }
      appendLocalLog("info", "正在初始化企业微信 CLI 缓存", "应用会使用当前 Bot ID / Secret 写入隔离 CLI 缓存并拉取 MCP 配置。", botId);
      wecomInitStatus = {
        ...wecomInitStatus,
        [botId]: { level: "info", text: "正在初始化/刷新企业微信 CLI 缓存..." }
      };
      button.disabled = true;
      button.textContent = "初始化中...";
      render();
      try {
        const result = await window.quarkfanTools.initWeComCli(botId);
        const detail = result?.output || `已刷新 ${bot?.name || botId} 的官方 CLI 缓存。`;
        appendLocalLog("success", "企业微信 CLI 缓存初始化完成", detail, botId);
        wecomInitStatus = {
          ...wecomInitStatus,
          [botId]: { level: "success", text: detail }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLocalLog("error", "企业微信 CLI 缓存初始化失败", message, botId);
        wecomInitStatus = {
          ...wecomInitStatus,
          [botId]: { level: "error", text: message }
        };
        window.alert(message);
      }
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".fetch-wecom-chat-list").forEach((button) => {
    button.onclick = async () => {
      const botId = String(button.dataset.id);
      const bot = snapshot.config.bots.find((item) => item.id === botId);
      if ((bot?.provider ?? "lark") === "wecom") {
        appendLocalLog("warn", "企业微信聊天列表获取已暂停", WECOM_PROVIDER_CLOSED_MESSAGE, botId);
        window.alert(WECOM_PROVIDER_CLOSED_MESSAGE);
        return;
      }
      appendLocalLog("info", "正在获取企业微信聊天列表", "应用会调用官方 wecom-cli msg get_msg_chat_list 拉取最近 7 天会话。", botId);
      wecomChatListStatus = {
        ...wecomChatListStatus,
        [botId]: { level: "info", text: "正在获取最近 7 天企业微信聊天列表..." }
      };
      render();
      try {
        const result = await window.quarkfanTools.weComChatList(botId);
        const text = result.chats.length > 0
          ? `获取 ${result.chats.length} 个会话，时间范围 ${result.beginTime} - ${result.endTime}。`
          : `最近 7 天未获取到会话，时间范围 ${result.beginTime} - ${result.endTime}。`;
        appendLocalLog("success", "企业微信聊天列表获取完成", text, botId);
        wecomChatListStatus = {
          ...wecomChatListStatus,
          [botId]: { level: "success", text, result }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLocalLog("error", "企业微信聊天列表获取失败", message, botId);
        wecomChatListStatus = {
          ...wecomChatListStatus,
          [botId]: { level: "error", text: message }
        };
        window.alert(message);
      }
      render();
    };
  });
  document.querySelectorAll<HTMLInputElement>(".wecom-chat-select").forEach((input) => {
    input.onchange = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>("#wecom-poll-chat-id");
      const candidateValues = new Set([...document.querySelectorAll<HTMLInputElement>(".wecom-chat-select")].map((item) => item.value));
      const manualValues = (textarea?.value ?? "")
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter((item) => item && !candidateValues.has(item) && !candidateValues.has(`2:${item}`) && !candidateValues.has(`1:${item}`));
      const values = manualValues.concat([...document.querySelectorAll<HTMLInputElement>(".wecom-chat-select:checked")]
        .map((item) => item.value)
        .filter(Boolean));
      if (textarea) textarea.value = values.join("\n");
    };
  });
  document.querySelector<HTMLSelectElement>("#log-level")?.addEventListener("change", (event) => {
    logLevel = (event.currentTarget as HTMLSelectElement).value as typeof logLevel;
    render();
  });
  document.querySelectorAll<HTMLInputElement>("[data-skill-filter]").forEach((input) => {
    input.addEventListener("input", () => filterBotSkills(String(input.dataset.skillFilter)));
  });
  document.querySelectorAll<HTMLSelectElement>("[data-skill-auth-filter]").forEach((input) => {
    input.addEventListener("change", () => filterBotSkills(String(input.dataset.skillAuthFilter)));
  });
  document.querySelectorAll<HTMLButtonElement>(".session-view").forEach((button) => {
    button.onclick = async () => {
      const value: StorageSessionDetail = await window.quarkfanTools.storageSessionDetail(String(button.dataset.id));
      sessionDetailForPreview = value;
      preview = { title: `会话 ${value.conversationKey}`, html: renderSessionDetail(value) };
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".run-detail-view").forEach((button) => {
    button.onclick = () => {
      const run = filteredScheduledRuns()[Number(button.dataset.runIndex)];
      if (!run) return;
      preview = { title: `定时任务运行 / ${run.taskName}`, html: renderScheduledRunDetail(run) };
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#refresh-mcp-diagnostics")?.addEventListener("click", async () => {
    mcpDiagnostics = await window.quarkfanTools.mcpDiagnostics(true);
    render();
  });
  document.querySelector<HTMLSelectElement>("#session-event-filter")?.addEventListener("change", (event) => {
    const selected = (event.currentTarget as HTMLSelectElement).value;
    document.querySelectorAll<HTMLElement>("[data-session-event-type]").forEach((item) => {
      item.hidden = selected !== "all" && item.dataset.sessionEventType !== selected;
    });
  });
  document.querySelector<HTMLButtonElement>("#export-session-detail")?.addEventListener("click", () => {
    if (!sessionDetailForPreview) return;
    const blob = new Blob([`${JSON.stringify(sessionDetailForPreview, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qft-session-${sessionDetailForPreview.botId}-${sessionDetailForPreview.id.replace(/[^a-z0-9._-]+/gi, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector<HTMLButtonElement>("#close-preview")?.addEventListener("click", () => { preview = null; sessionDetailForPreview = null; render(); });
  document.querySelector<HTMLElement>("#preview-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) { preview = null; sessionDetailForPreview = null; render(); }
  });
  document.querySelectorAll<HTMLButtonElement>(".skill-select-visible").forEach((button) => {
    button.onclick = () => setVisibleBotSkills(String(button.dataset.id), true);
  });
  document.querySelectorAll<HTMLButtonElement>(".skill-clear-visible").forEach((button) => {
    button.onclick = () => setVisibleBotSkills(String(button.dataset.id), false);
  });
  document.querySelector<HTMLButtonElement>("#clear-expired")?.addEventListener("click", async () => {
    storage = await window.quarkfanTools.clearExpiredStorage();
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-selected")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll<HTMLInputElement>("[data-session-id]:checked")].map((input) => String(input.dataset.sessionId));
    if (ids.length === 0) return;
    storage = await window.quarkfanTools.clearSelectedStorage(ids);
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-file-cache")?.addEventListener("click", async () => {
    if (!window.confirm("确认清理文件缓存？会话记录会保留，但后续需要相关文件时可能重新下载或生成。")) return;
    storage = await window.quarkfanTools.clearFileCacheStorage();
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelector<HTMLButtonElement>("#repair-file-cache")?.addEventListener("click", async () => {
    storage = await window.quarkfanTools.repairFileCacheStorage();
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-expired-custom-app-artifacts")?.addEventListener("click", async () => {
    if (!window.confirm("确认清理过期自定义应用运行产物？自定义应用本体、Bot 配置和授权会保留。")) return;
    storage = await window.quarkfanTools.clearExpiredCustomAppArtifactsStorage();
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-custom-app-artifacts")?.addEventListener("click", async () => {
    if (!window.confirm("确认清理全部自定义应用运行产物？这会删除微信读取截图等调试文件，但不会删除自定义应用本体。")) return;
    storage = await window.quarkfanTools.clearCustomAppArtifactsStorage();
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-cache-entry").forEach((button) => {
    button.onclick = async () => {
      const cacheKey = String(button.dataset.cacheKey ?? "");
      if (!cacheKey) return;
      if (!window.confirm("确认删除这条文件缓存？后续需要同一文件时可能重新下载或导出。")) return;
      storage = await window.quarkfanTools.clearFileCacheEntryStorage(cacheKey);
      scheduledRuns = await window.quarkfanTools.scheduledRuns();
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#sync-market")?.addEventListener("click", async () => {
    const form = new FormData(document.querySelector<HTMLFormElement>("#config-form")!);
    const next = structuredClone(snapshot.config);
    next.skillMarket.enabled = String(form.get("marketEnabled") ?? "false") === "true";
    next.skillMarket.repositoryUrl = String(form.get("marketRepositoryUrl") ?? "");
    next.skillMarket.branch = String(form.get("marketBranch") ?? "main");
    next.skillMarket.token = String(form.get("marketToken") ?? "");
    snapshot = await window.quarkfanTools.saveConfig(next);
    mcpDiagnostics = await window.quarkfanTools.mcpDiagnostics();
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-all-storage")?.addEventListener("click", async () => {
    if (!window.confirm("确认清理全部会话上下文、workspace 和消息附件？此操作不可恢复。")) return;
    storage = await window.quarkfanTools.clearAllSessionStorage();
    scheduledRuns = await window.quarkfanTools.scheduledRuns();
    render();
  });
  document.querySelector<HTMLSelectElement>("#run-history-bot")?.addEventListener("change", (event) => {
    runHistoryBotFilter = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLSelectElement>("#run-history-status")?.addEventListener("change", (event) => {
    runHistoryStatusFilter = (event.currentTarget as HTMLSelectElement).value as typeof runHistoryStatusFilter;
    render();
  });
  document.querySelector<HTMLSelectElement>("#cache-bot-filter")?.addEventListener("change", (event) => {
    cacheBotFilter = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLSelectElement>("#cache-source-filter")?.addEventListener("change", (event) => {
    cacheSourceFilter = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLButtonElement>("#add-bot")?.addEventListener("click", async () => {
    const bot = newBot();
    const next = structuredClone(snapshot.config);
    next.bots.push(bot);
    snapshot = await window.quarkfanTools.saveConfig(next);
    editingBotId = bot.id;
    botEditorScrollTop = 0;
    activeBotEditorSection = "basic";
    render();
  });
  document.querySelector<HTMLButtonElement>("#close-bot-editor")?.addEventListener("click", () => {
    discardAllScheduledTaskDrafts();
    editingBotId = "";
    editingScheduledTaskId = "";
    botEditorScrollTop = 0;
    render();
  });
  document.querySelector<HTMLElement>("#bot-editor-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      discardAllScheduledTaskDrafts();
      editingBotId = "";
      editingScheduledTaskId = "";
      botEditorScrollTop = 0;
      render();
    }
  });
  document.querySelector<HTMLElement>(".bot-editor-body")?.addEventListener("scroll", (event) => {
    botEditorScrollTop = (event.currentTarget as HTMLElement).scrollTop;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-bot-editor-section]").forEach((button) => {
    button.onclick = () => {
      activeBotEditorSection = button.dataset.botEditorSection as BotEditorSection;
      botEditorScrollTop = 0;
      const shell = document.querySelector<HTMLElement>("#bot-editor-form");
      shell?.setAttribute("data-active-section", activeBotEditorSection);
      document.querySelectorAll<HTMLButtonElement>("[data-bot-editor-section]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      document.querySelectorAll<HTMLElement>("[data-bot-editor-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.botEditorPanel === activeBotEditorSection);
      });
      document.querySelector<HTMLElement>(".bot-editor-body")?.scrollTo({ top: 0 });
    };
  });
  document.querySelector<HTMLSelectElement>("#bot-provider-select")?.addEventListener("change", (event) => {
    const modal = document.querySelector<HTMLElement>(".bot-editor-modal");
    if (modal) modal.dataset.provider = (event.currentTarget as HTMLSelectElement).value;
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-bot").forEach((button) => {
    button.onclick = async () => {
      const bot = snapshot.config.bots.find((item) => item.id === button.dataset.id);
      if (!window.confirm(`确认删除机器人“${bot?.name || button.dataset.id}”？`)) return;
      const next = structuredClone(snapshot.config);
      next.bots = next.bots.filter((item) => item.id !== button.dataset.id);
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = "";
      botEditorScrollTop = 0;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".oauth-bot").forEach((button) => {
    button.onclick = () => void window.quarkfanTools.loginLarkUser(String(button.dataset.id));
  });
  document.querySelector<HTMLButtonElement>("#add-mcp-server")?.addEventListener("click", async () => {
    const next = structuredClone(snapshot.config);
    const nextIndex = next.mcpServers.length + 1;
    next.mcpServers.push({
      id: `mcp-${nextIndex}`,
      name: `MCP ${nextIndex}`,
      enabled: true,
      transport: "stdio",
      command: "",
      args: [],
      env: []
    });
    snapshot = await window.quarkfanTools.saveConfig(next);
    mcpDiagnostics = await window.quarkfanTools.mcpDiagnostics();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-mcp-server").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      next.mcpServers = next.mcpServers.filter((_, index) => index !== Number(button.dataset.index));
      snapshot = await window.quarkfanTools.saveConfig(next);
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".add-command-binding").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === button.dataset.id);
      if (!bot) return;
      const options = commandTargetOptions(bot);
      if (options.length === 0) return;
      const [kind, id] = options[0].value.split(":");
      bot.commandBindings = [...(bot.commandBindings ?? []), {
        name: `cmd${(bot.commandBindings?.length ?? 0) + 1}`,
        enabled: true,
        target: {
          type: "capability",
          capability: {
            kind: kind as "skill" | "mcp" | "app" | "suite" | "workflow",
            id
          }
        }
      }];
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
      activeBotEditorSection = "commands";
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-command-binding").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === editingBotId);
      if (!bot) return;
      bot.commandBindings = (bot.commandBindings ?? []).filter((_, index) => index !== Number(button.dataset.index));
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
      activeBotEditorSection = "commands";
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".add-delivery-route").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === button.dataset.id);
      if (!bot) return;
      const nextIndex = (bot.deliveryRoutes?.length ?? 0) + 1;
      bot.deliveryRoutes = [...(bot.deliveryRoutes ?? []), {
        id: `delivery-route-${nextIndex}`,
        enabled: true,
        provider: "lark",
        chatId: "",
        mode: "copy-final-reply",
        name: `投递路由 ${nextIndex}`
      }];
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
      activeBotEditorSection = "delivery";
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-delivery-route").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === editingBotId);
      if (!bot) return;
      bot.deliveryRoutes = (bot.deliveryRoutes ?? []).filter((_, index) => index !== Number(button.dataset.index));
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
      activeBotEditorSection = "delivery";
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".add-scheduled-task").forEach((button) => {
    button.onclick = () => {
      const bot = snapshot.config.bots.find((item) => item.id === button.dataset.id);
      if (!bot) return;
      const commandName = scheduledCommandOptions(bot)[0] ?? "";
      const capabilityValue = scheduledCapabilityOptions(bot)[0]?.value ?? "skill:";
      const [kind, id] = capabilityValue.split(":");
      const taskId = crypto.randomUUID();
      bot.scheduledTasks = [...(bot.scheduledTasks ?? []), {
        id: taskId,
        botId: bot.id,
        enabled: true,
        name: `定时任务 ${(bot.scheduledTasks?.length ?? 0) + 1}`,
        schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "09:00" },
        target: { type: "agent", commandName, capability: id ? { kind: kind as "skill" | "mcp" | "app" | "suite" | "workflow", id } : undefined, prompt: "请执行定时任务" },
        delivery: { type: "chat", chatId: "" }
      }];
      draftScheduledTaskIds.add(taskId);
      editingBotId = bot.id;
      activeBotEditorSection = "scheduled";
      editingScheduledTaskId = taskId;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".edit-scheduled-task").forEach((button) => {
    button.onclick = () => {
      editingScheduledTaskId = String(button.dataset.taskId ?? "");
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#close-scheduled-task-editor")?.addEventListener("click", () => {
    discardScheduledTaskDraft(editingScheduledTaskId);
    editingScheduledTaskId = "";
    render();
  });
  document.querySelector<HTMLButtonElement>("#cancel-scheduled-task-editor")?.addEventListener("click", () => {
    discardScheduledTaskDraft(editingScheduledTaskId);
    editingScheduledTaskId = "";
    render();
  });
  document.querySelector<HTMLElement>("#scheduled-task-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      discardScheduledTaskDraft(editingScheduledTaskId);
      editingScheduledTaskId = "";
      render();
    }
  });
  document.querySelector<HTMLButtonElement>("#save-scheduled-task-editor")?.addEventListener("click", async () => {
    if (!editingBotId) return;
    const next = structuredClone(snapshot.config);
    const bot = next.bots.find((item) => item.id === editingBotId);
    const taskIndex = bot?.scheduledTasks?.findIndex((task) => task.id === editingScheduledTaskId) ?? -1;
    if (!bot || taskIndex < 0) return;
    const saved = readScheduledTaskFromEditor(bot, taskIndex);
    if (!saved) {
      window.alert("请填写任务名、Prompt 和投递 chat_id 后再保存定时任务。");
      return;
    }
    bot.scheduledTasks = (bot.scheduledTasks ?? []).map((task, index) => index === taskIndex ? saved : task);
    snapshot = await window.quarkfanTools.saveConfig(next);
    editingBotId = bot.id;
    draftScheduledTaskIds.delete(saved.id);
    editingScheduledTaskId = "";
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-scheduled-task").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === editingBotId);
      if (!bot) return;
      bot.scheduledTasks = (bot.scheduledTasks ?? []).filter((_, index) => index !== Number(button.dataset.index));
      const removedTaskId = (snapshot.config.bots.find((item) => item.id === editingBotId)?.scheduledTasks ?? [])[Number(button.dataset.index)]?.id;
      if (removedTaskId) draftScheduledTaskIds.delete(removedTaskId);
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
      if (!(bot.scheduledTasks ?? []).some((task) => task.id === editingScheduledTaskId)) editingScheduledTaskId = "";
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".run-scheduled-task").forEach((button) => {
    button.onclick = async () => {
      const botId = String(button.dataset.botId ?? "");
      const taskId = String(button.dataset.taskId ?? "");
      if (!botId || !taskId) return;
      try {
        snapshot = await window.quarkfanTools.runScheduledTaskNow(botId, taskId);
        scheduledRuns = await window.quarkfanTools.scheduledRuns();
      } catch (error) {
        window.alert(String(error instanceof Error ? error.message : error));
      }
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".scheduled-edit-bot").forEach((button) => {
    button.onclick = () => {
      editingBotId = String(button.dataset.botId ?? "");
      editingScheduledTaskId = String(button.dataset.taskId ?? "");
      botEditorScrollTop = 0;
      render();
    };
  });
  document.querySelectorAll<HTMLSelectElement>("[data-task-schedule-type]").forEach((select) => {
    select.onchange = () => {
      const card = select.closest<HTMLElement>(".scheduled-task-modal");
      if (card) card.dataset.scheduleType = select.value;
    };
  });
  document.querySelectorAll<HTMLSelectElement>("[data-task-target-type]").forEach((select) => {
    select.onchange = () => {
      const card = select.closest<HTMLElement>(".scheduled-task-modal");
      if (card) card.dataset.targetType = select.value;
    };
  });
  document.querySelector<HTMLFormElement>("#bot-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = structuredClone(snapshot.config);
    const bot = next.bots.find((item) => item.id === editingBotId);
    if (!bot) return;
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-edit-bot-field]").forEach((input) => {
      const fieldName = input.dataset.editBotField as keyof BotConfig;
      (bot as unknown as Record<string, unknown>)[fieldName] = fieldName === "oauthScopes"
        ? parseScopes(input.value)
        : ["enabled", "showProgress"].includes(fieldName) ? input.value === "true"
          : fieldName === "longTaskNoticeSeconds" ? Math.max(0, Math.floor(Number(input.value) || 0))
            : input.value;
    });
    const wecomEventCommand = document.querySelector<HTMLTextAreaElement>("#wecom-event-command")?.value.trim() ?? "";
    const wecomPollChatType = document.querySelector<HTMLSelectElement>("#wecom-poll-chat-type")?.value.trim() ?? "2";
    const wecomPollChatId = document.querySelector<HTMLTextAreaElement>("#wecom-poll-chat-id")?.value.trim() ?? "";
    const wecomPollIntervalMs = document.querySelector<HTMLInputElement>("#wecom-poll-interval-ms")?.value.trim() ?? "";
    const wecomPollWindowSeconds = document.querySelector<HTMLInputElement>("#wecom-poll-window-seconds")?.value.trim() ?? "";
    const wecomPollPayload = document.querySelector<HTMLTextAreaElement>("#wecom-poll-payload")?.value.trim() ?? "";
    bot.providerOptions = { ...(bot.providerOptions ?? {}) };
    if (bot.provider === "wecom" && wecomEventCommand) {
      bot.providerOptions.eventCommand = wecomEventCommand;
    } else {
      delete bot.providerOptions.eventCommand;
    }
    if (bot.provider === "wecom") {
      bot.providerOptions.pollChatType = wecomPollChatType === "1" ? "1" : "2";
      if (wecomPollChatId) bot.providerOptions.pollChatId = wecomPollChatId;
      else delete bot.providerOptions.pollChatId;
      if (wecomPollIntervalMs) bot.providerOptions.pollIntervalMs = wecomPollIntervalMs;
      else delete bot.providerOptions.pollIntervalMs;
      if (wecomPollWindowSeconds) bot.providerOptions.pollWindowSeconds = wecomPollWindowSeconds;
      else delete bot.providerOptions.pollWindowSeconds;
      if (wecomPollPayload) bot.providerOptions.pollPayload = wecomPollPayload;
      else delete bot.providerOptions.pollPayload;
    } else {
      delete bot.providerOptions.pollChatType;
      delete bot.providerOptions.pollChatId;
      delete bot.providerOptions.pollIntervalMs;
      delete bot.providerOptions.pollWindowSeconds;
      delete bot.providerOptions.pollPayload;
    }
    bot.skillNames = [...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-skill="${editingBotId}"]:checked`)].map((input) => input.value);
    const larkConnectorEnabled = document.querySelector<HTMLInputElement>("#lark-connector-enabled")?.checked ?? false;
    const larkConnectorAppId = document.querySelector<HTMLInputElement>("#lark-connector-app-id")?.value.trim() ?? "";
    const larkConnectorAppSecret = document.querySelector<HTMLInputElement>("#lark-connector-app-secret")?.value ?? "";
    bot.connectors = {
      ...(bot.connectors ?? {}),
      lark: larkConnectorEnabled && larkConnectorAppId && larkConnectorAppSecret
        ? {
            enabled: true,
            appId: larkConnectorAppId,
            appSecret: larkConnectorAppSecret,
            cliPath: document.querySelector<HTMLInputElement>("#lark-connector-cli-path")?.value.trim() || undefined,
            profile: document.querySelector<HTMLInputElement>("#lark-connector-profile")?.value.trim() || undefined,
            oauthScopes: parseScopes(document.querySelector<HTMLTextAreaElement>("#lark-connector-oauth-scopes")?.value ?? "")
          }
        : undefined
    };
    bot.deliveryRoutes = [...document.querySelectorAll<HTMLInputElement>("[data-route-chat-id]")]
      .map((input, index) => {
        const chatId = input.value.trim();
        const route = (bot.deliveryRoutes ?? [])[index];
        const routeId = document.querySelector<HTMLInputElement>(`[data-route-id="${index}"]`)?.value.trim() || route?.id || crypto.randomUUID();
        return {
          id: routeId,
          enabled: (document.querySelector<HTMLSelectElement>(`[data-route-enabled="${index}"]`)?.value ?? "true") === "true",
          provider: (document.querySelector<HTMLSelectElement>(`[data-route-provider="${index}"]`)?.value ?? "lark") as NonNullable<BotConfig["deliveryRoutes"]>[number]["provider"],
          chatId,
          mode: "copy-final-reply" as const,
          name: document.querySelector<HTMLInputElement>(`[data-route-name="${index}"]`)?.value.trim() || undefined
        };
      });
    const selectedMcps = new Set([...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-mcp="${editingBotId}"]:checked`)].map((input) => input.value));
    const selectedApps = new Set([...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-app="${editingBotId}"]:checked`)].map((input) => input.value));
    const selectedSuites = new Set([...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-suite="${editingBotId}"]:checked`)].map((input) => input.value));
    const selectedPolicy = (kind: "mcp" | "app" | "suite", id: string) => {
      const select = [...document.querySelectorAll<HTMLSelectElement>("[data-edit-bot-capability-policy]")]
        .find((item) => item.dataset.editBotCapabilityPolicy === `${kind}:${id}`);
      return policyFromPreset(select?.value ?? policyPresetValue(botCapabilityPolicy(bot, kind, id)));
    };
    const existingNonManagedRefs = (bot.capabilityRefs ?? []).filter((ref) => !["app", "suite", "mcp"].includes(ref.kind));
    bot.capabilityRefs = [
      ...existingNonManagedRefs,
      ...[...selectedMcps].map((id) => ({
        kind: "mcp" as const,
        id,
        enabled: true,
        policy: selectedPolicy("mcp", id)
      })),
      ...[...selectedApps].map((id) => ({
        kind: "app" as const,
        id,
        enabled: true,
        policy: selectedPolicy("app", id)
      })),
      ...[...selectedSuites].map((id) => ({
        kind: "suite" as const,
        id,
        enabled: true,
        policy: selectedPolicy("suite", id)
      }))
    ];
      bot.commandBindings = [...document.querySelectorAll<HTMLInputElement>("[data-command-name]")]
      .map((input, index) => {
        const name = input.value.trim().toLowerCase();
        const targetValue = (document.querySelector<HTMLSelectElement>(`[data-command-target="${index}"]`)?.value ?? "").trim();
        const [kind, id] = targetValue.split(":");
        if (!/^[a-z0-9_-]+$/.test(name) || !kind || !id) return null;
        return {
          name,
          aliases: [...new Set((document.querySelector<HTMLInputElement>(`[data-command-aliases="${index}"]`)?.value ?? "")
            .split(/[\s,]+/)
            .map((alias) => alias.trim().toLowerCase().replace(/^\//, ""))
            .filter((alias) => /^[a-z0-9_-]+$/.test(alias) && alias !== name && !["new", "continue", "owner", "help"].includes(alias)))],
          enabled: (document.querySelector<HTMLSelectElement>(`[data-command-enabled="${index}"]`)?.value ?? "true") === "true",
          description: document.querySelector<HTMLInputElement>(`[data-command-description="${index}"]`)?.value.trim() || undefined,
          promptTemplate: document.querySelector<HTMLInputElement>(`[data-command-template="${index}"]`)?.value.trim() || undefined,
          target: {
            type: "capability" as const,
            capability: {
              kind: kind as "skill" | "mcp" | "app" | "suite" | "workflow",
              id
            }
          }
        };
      })
      .filter((binding): binding is NonNullable<BotConfig["commandBindings"]>[number] => Boolean(binding));
    const editedTaskIndex = (bot.scheduledTasks ?? []).findIndex((task) => task.id === editingScheduledTaskId);
    if (editedTaskIndex >= 0 && document.querySelector<HTMLInputElement>(`[data-task-name="${editedTaskIndex}"]`)) {
      const saved = readScheduledTaskFromEditor(bot, editedTaskIndex);
      if (saved) {
        bot.scheduledTasks = (bot.scheduledTasks ?? []).map((task, index) => index === editedTaskIndex ? saved : task);
        draftScheduledTaskIds.delete(saved.id);
      }
    }
    snapshot = await window.quarkfanTools.saveConfig(next);
    draftScheduledTaskIds.clear();
    selectedBotId = bot.id;
    editingBotId = "";
    render();
  });
  document.querySelector<HTMLFormElement>("#config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = structuredClone(snapshot.config);
    next.model.providerName = String(form.get("providerName") ?? "");
    next.model.baseUrl = String(form.get("baseUrl") ?? "");
    next.model.model = String(form.get("model") ?? "");
    next.model.apiKey = String(form.get("apiKey") ?? "");
    next.model.multimodalEnabled = String(form.get("multimodalEnabled") ?? "true") === "true";
    next.ui.theme = String(form.get("uiTheme") ?? "system") as AppConfig["ui"]["theme"];
    next.runtime.maxConcurrentTasks = Math.max(1, Math.min(20, Number(form.get("maxConcurrentTasks") ?? 2) || 2));
    next.runtime.maxAgentTurns = Math.max(10, Math.min(100, Number(form.get("maxAgentTurns") ?? 60) || 60));
    next.runtime.customAppArtifacts = {
      autoCleanup: String(form.get("customAppArtifactsAutoCleanup") ?? "false") === "true",
      retentionDays: Math.max(1, Math.min(90, Number(form.get("customAppArtifactsRetentionDays") ?? 7) || 7))
    };
    next.runtime.customAppReplyProcessing = {
      mode: "raw",
      prompt: "",
      maxInputChars: 12000
    };
    next.mcpServers = [...document.querySelectorAll<HTMLInputElement>("[data-mcp-name]")]
      .map((input, index) => {
        const id = document.querySelector<HTMLInputElement>(`[data-mcp-id="${index}"]`)?.value.trim() || "";
        const name = input.value.trim();
        const transport = (document.querySelector<HTMLSelectElement>(`[data-mcp-transport="${index}"]`)?.value ?? "stdio") as "stdio" | "http" | "sse";
        const command = document.querySelector<HTMLInputElement>(`[data-mcp-command="${index}"]`)?.value.trim() || "";
        const url = document.querySelector<HTMLInputElement>(`[data-mcp-url="${index}"]`)?.value.trim() || "";
        if (!id || !name) return null;
        return {
          id,
          name,
          enabled: (document.querySelector<HTMLSelectElement>(`[data-mcp-enabled="${index}"]`)?.value ?? "true") === "true",
          transport,
          command,
          args: (document.querySelector<HTMLInputElement>(`[data-mcp-args="${index}"]`)?.value ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean),
          url: url || undefined,
          env: (document.querySelector<HTMLInputElement>(`[data-mcp-env="${index}"]`)?.value ?? "")
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [name, ...rest] = line.split("=");
              return { name: name.trim(), value: rest.join("=").trim() };
            })
            .filter((item) => item.name),
          timeoutMs: Math.max(1000, Number(document.querySelector<HTMLInputElement>(`[data-mcp-timeout="${index}"]`)?.value ?? 0) || 0) || undefined,
          alwaysLoad: (document.querySelector<HTMLSelectElement>(`[data-mcp-always-load="${index}"]`)?.value ?? "false") === "true",
          description: document.querySelector<HTMLInputElement>(`[data-mcp-description="${index}"]`)?.value.trim() || undefined
        };
      })
      .filter((server): server is AppConfig["mcpServers"][number] => Boolean(server));
    next.skillMarket.enabled = String(form.get("marketEnabled") ?? "false") === "true";
    next.skillMarket.repositoryUrl = String(form.get("marketRepositoryUrl") ?? "");
    next.skillMarket.branch = String(form.get("marketBranch") ?? "main");
    next.skillMarket.token = String(form.get("marketToken") ?? "");
    snapshot = await window.quarkfanTools.saveConfig(next);
    mcpDiagnostics = await window.quarkfanTools.mcpDiagnostics();
    activeView = "console";
    render();
  });
}

function filterBotSkills(botId: string): void {
  const query = document.querySelector<HTMLInputElement>(`[data-skill-filter="${botId}"]`)?.value.trim().toLowerCase() ?? "";
  const auth = document.querySelector<HTMLSelectElement>(`[data-skill-auth-filter="${botId}"]`)?.value ?? "all";
  document.querySelectorAll<HTMLElement>(`[data-bot-skill-row="${botId}"]`).forEach((row) => {
    const authMatches = auth === "all" || (auth === "authorized") === (row.dataset.authorized === "true");
    row.hidden = !authMatches || !String(row.dataset.skillSearch).includes(query);
  });
}

function normalizeMarketSource(value: string | undefined): MarketSource {
  return value === "local" || value === "market" || value === "builtin" || value === "unused" ? value : "all";
}

function marketSkillMatches(skill: RuntimeSnapshot["skills"][number]): boolean {
  const query = marketSearch.trim().toLowerCase();
  const sourceMatches = marketSource === "all"
    || skill.source === marketSource
    || (marketSource === "unused" && !snapshot.config.bots.some((bot) => bot.skillNames.includes(skill.name)));
  return sourceMatches && `${skill.name} ${skill.description}`.toLowerCase().includes(query);
}

function filterMarketSkills(): void {
  const query = marketSearch.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>("[data-market-search]").forEach((row) => {
    const sourceMatches = marketSource === "all"
      || row.dataset.marketSource === marketSource
      || (marketSource === "unused" && row.dataset.marketUnused === "true");
    row.hidden = !sourceMatches || !String(row.dataset.marketSearch).includes(query);
  });
}

function setVisibleBotSkills(botId: string, checked: boolean): void {
  document.querySelectorAll<HTMLElement>(`[data-bot-skill-row="${botId}"]`).forEach((row) => {
    if (row.hidden) return;
    const input = row.querySelector<HTMLInputElement>(`[data-bot-skill="${botId}"]`);
    if (input) input.checked = checked;
  });
}

async function bootstrap(): Promise<void> {
  [snapshot, logs, storage, scheduledRuns, mcpDiagnostics, capabilityAudit, platformDiagnostics, applicationInfo] = await Promise.all([
    window.quarkfanTools.snapshot(),
    window.quarkfanTools.logs(),
    window.quarkfanTools.storageStats(),
    window.quarkfanTools.scheduledRuns(),
    window.quarkfanTools.mcpDiagnostics(),
    window.quarkfanTools.capabilityAudit(),
    window.quarkfanTools.platformDiagnostics(),
    window.quarkfanTools.appInfo()
  ]);
  window.quarkfanTools.onSnapshot((value) => {
    snapshot = value;
    if (!selectedBotId && snapshot.config.bots[0]) selectedBotId = snapshot.config.bots[0].id;
    render();
  });
  window.quarkfanTools.onLog((entry) => {
    logs = [...logs.slice(-499), entry];
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && showReleaseNotes) closeReleaseNotes();
    if (event.key === "Escape" && showManual) closeManual();
  });
  systemThemeMedia.addEventListener("change", () => {
    if (snapshot.config.ui.theme !== "system") return;
    applyTheme(snapshot.config);
  });
  if (snapshot.config.bots[0]) selectedBotId = snapshot.config.bots[0].id;
  render();
}

void bootstrap();
