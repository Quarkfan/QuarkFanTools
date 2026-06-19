import "./style.css";
import logoUrl from "../logo.png";
import type { AppConfig, AppInfo, BotConfig, CustomAppPreview, LogEntry, McpServerDiagnostic, RuntimeSnapshot, ScheduledTask, ScheduledTaskRunSummary, SkillPreview, StorageSessionDetail, StorageStats, SuitePreview } from "../electron/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: RuntimeSnapshot;
let logs: LogEntry[] = [];
let storage: StorageStats;
let scheduledRuns: ScheduledTaskRunSummary[] = [];
let mcpDiagnostics: McpServerDiagnostic[] = [];
let applicationInfo: AppInfo;
let activeView: "console" | "skills" | "capabilities" | "config" | "storage" = "console";
let selectedBotId = "";
let logLevel: "all" | LogEntry["level"] = "all";
let runHistoryBotFilter = "all";
let runHistoryStatusFilter: "all" | ScheduledTaskRunSummary["status"] = "all";
let cacheBotFilter = "all";
let cacheSourceFilter = "all";
let showReleaseNotes = false;
let marketSource = "all";
let marketSearch = "";
let preview: { title: string; body?: string; html?: string } | null = null;
let editingBotId = "";
let helpTopicKey = "";
let showManual = false;
const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

const helpTopics: Record<string, { title: string; body: string }> = {
  providerName: { title: "Provider 名称", body: "仅用于界面展示，方便区分当前配置的模型服务商。" },
  baseUrl: { title: "Claude Base URL", body: "兼容 Claude Messages API 的服务地址。当前 Agent SDK 需要 Claude/Anthropic 兼容接口和工具调用能力。" },
  model: { title: "模型", body: "发送给模型服务的模型名。复杂 Skill、飞书资料检索和多模态任务需要选择支持工具调用的模型。" },
  apiKey: { title: "API Key", body: "模型服务认证密钥，仅保存在本机配置文件，不提交到 Git。" },
  maxConcurrentTasks: { title: "最大并发任务数", body: "限制不同会话同时运行的 Agent 数量。同一会话始终串行处理，避免上下文交叉。" },
  maxAgentTurns: { title: "单次 Agent 最大步数", body: "限制一次消息处理中 Agent 可执行的工具调用轮数。复杂检索可适当调高，范围 10-100。" },
  multimodalEnabled: { title: "多模态视觉能力", body: "开启后图片消息和 PowerPoint 预览可作为视觉输入交给模型；关闭后只处理文本内容。" },
  uiTheme: { title: "界面主题", body: "支持跟随系统、浅色和深色。跟随系统时会根据 macOS 当前外观自动切换。" },
  marketEnabled: { title: "启用技能市场", body: "启用后可从 HTTPS Git 仓库同步 Skill。同步后的 Skill 默认不授权给任何 Bot。" },
  marketRepositoryUrl: { title: "HTTPS Git 仓库", body: "Skill 市场仓库地址。当前只支持 HTTPS，不依赖系统 Git 或 SSH Key。" },
  marketBranch: { title: "分支", body: "同步 Skill 市场时使用的 Git 分支。" },
  marketToken: { title: "访问 Token", body: "私有 Skill 市场仓库的访问 Token。仅保存在本机配置中。" },
  mcpServers: { title: "MCP 服务", body: "MCP 服务是全局配置的本机工具能力，当前支持 stdio 方式。只有被 Bot 显式授权后，Claude Agent 才能在该 Bot 上下文中使用它。" },
  botList: { title: "Bot 列表", body: "每个 Bot 拥有独立 IM CLI 状态、Claude home、会话 workspace 和 Skill 授权。点击行可编辑详细配置。" },
  botName: { title: "机器人名称", body: "界面和日志中展示的名称，不影响飞书开放平台配置。" },
  botEnabled: { title: "启用", body: "停用后该 Bot 不会启动监听，也不会作为可运行机器人计入配置检查。" },
  imProvider: { title: "消息平台", body: "控制该 Bot 从哪个 IM 平台接收消息并默认回复。飞书知识库、文件和跨平台投递通过连接器与投递路由单独配置，不必和消息入口相同。" },
  wecomEventCommand: { title: "企业微信事件桥命令", body: "官方 wecom-cli 是调用型工具，不提供飞书式事件长连接。企业微信 Bot 启动监听时会运行这里配置的本地命令，并从 stdout 逐行读取规范化 NDJSON 消息事件。建议填写本地脚本路径，不要把 Token 写入命令文本。" },
  appId: { title: "App / Corp ID", body: "当前消息平台的应用 ID。飞书填写 App ID，企业微信填写 Corp ID。" },
  appSecret: { title: "App / Corp Secret", body: "当前消息平台的应用密钥，仅保存在本机配置中。" },
  receiveIdentity: { title: "接收身份", body: "飞书事件监听使用的身份。一般使用 Bot；只有明确需要用户态事件时再切换。" },
  replyIdentity: { title: "回复身份", body: "机器人回复消息、表情和文件时使用的身份。Bot 态通常更稳定。" },
  pendingReaction: { title: "处理中表情", body: "收到消息后添加到原消息上的反应名称，任务结束后会移除，用于替代“正在查询”文本。" },
  ownerOpenId: { title: "Owner 飞书 open_id", body: "Agent 无法解决或需要人工处理时，会向该用户私聊发送处理卡片。" },
  longTaskNoticeSeconds: { title: "长任务提示时间", body: "单次消息处理超过该秒数仍未完成时，会先自动回复一段提示。填 0 表示关闭，开启时最终结果仍会继续正常回复。" },
  longTaskNoticeText: { title: "长任务提示文案", body: "长任务超过提示时间后自动回复给提问人的文案。只发送一次，不替代最终答案。" },
  oauthScopes: { title: "用户态 OAuth 额外权限", body: "默认会申请 search:docs:read。这里填写额外 scope 后，保存并重新点击用户态 OAuth 才会生效；飞书开放平台也必须先开通对应权限。" },
  larkConnector: { title: "飞书知识连接器", body: "当消息入口不是飞书时，仍可配置飞书连接器用于查找飞书文档、云盘文件、云 PPT 和向飞书群投递结果。未配置时微信 Bot 不会获得飞书资料能力。" },
  deliveryRoutes: { title: "结果投递路由", body: "最终回复先回到原消息平台；投递路由会把同一份最终结果复制发送到配置的目标平台 chat。跨平台投递需要对应 connector 可用。" },
  showProgress: { title: "向用户展示工作过程", body: "开启后向用户展示工具调用、检索和重试等可观察进度，不展示模型隐藏推理或敏感参数。" },
  skillAccess: { title: "允许访问的 Skills", body: "Bot 只能看到明确勾选的 Skills。新增或导入的 Skill 默认不授权，避免能力范围意外扩大。" },
  mcpAccess: { title: "允许访问的 MCP", body: "MCP 服务是全局定义、Bot 局部授权的工具能力。未授权的 MCP 不会进入当前 Bot 的 Claude Agent 上下文。" },
  customAppAccess: { title: "允许访问的自定义应用", body: "自定义应用通过 app.json 导入，并作为 Bot 可治理能力授权。导入不等于授权；只有勾选后，后续命令或定时任务才能调用。" },
  suiteAccess: { title: "允许访问的套件", body: "套件用于面向角色或行业组合 Skills、自定义应用、MCP 和工作流说明。当前支持导入、预览、Bot 挂载授权，并可作为命令目标向 Agent 注入套件上下文。" },
  commandBindings: { title: "命令映射", body: "将 /xxx 映射到某个 Skill、套件、Workflow 或自定义应用。保留命令 /new、/continue、/owner 不能占用；命令名建议使用小写字母、数字、短横线或下划线。" },
  scheduledTasks: { title: "定时任务", body: "定时任务属于单个 Bot，当前支持 interval、daily、weekly 三种计划类型，目标可选 agent、command 或 capability，并把结果投递到指定 chat_id。可手动立即运行已保存且启用的任务，结果同样写入运行历史。" }
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
  return Boolean(
    bot.enabled &&
    (bot.provider ?? "lark") !== "dingtalk" &&
    bot.appId &&
    bot.appSecret &&
    snapshot.config.model.baseUrl &&
    snapshot.config.model.model &&
    snapshot.config.model.apiKey
  );
}

function statusDot(ok: boolean): string {
  return `<span class="status-dot ${ok ? "ok" : ""}"></span>`;
}

function helpButton(topic: string): string {
  return `<button type="button" class="help-button" data-help="${escapeHtml(topic)}" aria-label="查看配置说明">?</button>`;
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
          <span class="brand-wordmark">QUARK<span>FAN</span>TOOLS</span>
        </span>
      </button>
      <div class="rail-label">LOCAL SKILL AGENT</div>
      <nav>
        <button class="${activeView === "console" ? "active" : ""}" data-view="console">运行台</button>
        <button class="${activeView === "skills" ? "active" : ""}" data-view="skills">技能市场</button>
        <button class="${activeView === "capabilities" ? "active" : ""}" data-view="capabilities">能力</button>
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
          <h1>${activeView === "console" ? "运行控制台" : activeView === "skills" ? "本地技能市场" : activeView === "capabilities" ? "Bot 能力治理" : activeView === "config" ? "机器人与模型配置" : "会话存储管理"}</h1>
        </div>
        <div class="actions">
          ${activeView === "skills" ? `<button class="ghost" id="import-skill">导入 Skill</button>` : ""}
          ${activeView === "capabilities" ? `<button class="ghost" id="import-suite">导入套件</button><button class="ghost" id="import-custom-app">导入自定义应用</button>` : ""}
        </div>
      </header>
      ${!isConfigured ? `<div class="notice">至少配置一个启用的 IM 机器人，并填写 Claude 兼容模型连接信息。</div>` : ""}
      ${activeView === "console" ? renderConsole() : activeView === "skills" ? renderSkills() : activeView === "capabilities" ? renderCapabilities() : activeView === "config" ? renderConfig() : renderStorage()}
    </main>
    ${showReleaseNotes ? renderReleaseNotes() : ""}
    ${preview ? renderPreview() : ""}
    ${editingBotId ? renderBotEditor() : ""}
    ${helpTopicKey ? renderHelpModal() : ""}
    ${showManual ? renderManual() : ""}
  `;
  bindEvents();
}

function skillSourceLabel(source: RuntimeSnapshot["skills"][number]["source"]): string {
  return source === "local" ? "本地导入" : source === "market" ? "Git 市场" : "应用内置";
}

function botHasCapability(bot: BotConfig, kind: string, id: string): boolean {
  return Boolean(bot.capabilityRefs?.some((ref) => ref.kind === kind && ref.id === id && ref.enabled));
}

function commandTargetOptions(bot: BotConfig): Array<{ label: string; value: string }> {
  return [
    ...snapshot.skills
      .filter((skill) => bot.skillNames.includes(skill.name))
      .map((skill) => ({ label: `Skill / ${skill.name}`, value: `skill:${skill.name}` })),
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
      .filter((customApp) => botHasCapability(bot, "app", customApp.id))
      .map((customApp) => ({ label: `App / ${customApp.name}`, value: `app:${customApp.id}` }))
  ];
}

function scheduledCapabilityOptions(bot: BotConfig): Array<{ label: string; value: string }> {
  return [
    ...snapshot.skills
      .filter((skill) => bot.skillNames.includes(skill.name))
      .map((skill) => ({ label: `Skill / ${skill.name}`, value: `skill:${skill.name}` })),
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
      .filter((customApp) => botHasCapability(bot, "app", customApp.id) && customApp.capabilities.scheduledCallable)
      .map((customApp) => ({ label: `App / ${customApp.name}`, value: `app:${customApp.id}` }))
  ];
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

function diagnosticLabel(status: McpServerDiagnostic["status"]): string {
  return status === "ok" ? "OK" : status === "warn" ? "WARN" : "ERROR";
}

function resourceOpenButton(kind: "skill" | "app" | "suite", id: string): string {
  return `<button type="button" class="ghost resource-open-folder" data-resource-kind="${kind}" data-resource-id="${escapeHtml(id)}">打开目录</button>`;
}

function renderCapabilities(): string {
  const appCount = snapshot.customApps.length;
  const skillCount = snapshot.skills.length;
  const suiteCount = snapshot.suites.length;
  const mcpCount = snapshot.config.mcpServers.length;
  const mountedRefs = snapshot.config.bots.reduce((count, bot) => count + (bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0) + bot.skillNames.length, 0);
  return `
    <section class="metrics">
      <article><span>能力目录</span><strong>${snapshot.capabilities.length}</strong></article>
      <article><span>Skills</span><strong>${skillCount}</strong></article>
      <article><span>自定义应用 / 套件 / MCP</span><strong>${appCount} / ${suiteCount} / ${mcpCount}</strong></article>
      <article><span>Bot 挂载引用</span><strong>${mountedRefs}</strong></article>
    </section>
    <section class="panel market-panel">
      <div class="panel-title"><span>MCP SERVERS</span><small>${mcpCount} configured</small></div>
      <div class="capability-note">MCP 服务是全局配置、本机运行的工具能力。当前版本支持 stdio 类型，并在 Bot 授权后通过 Claude Agent SDK 传入当前 Bot 上下文。刷新诊断会短暂启动 MCP 做协议握手和工具列表预览。</div>
      <div class="capability-actions"><button type="button" class="ghost" id="refresh-mcp-diagnostics" ${mcpCount === 0 ? "disabled" : ""}>刷新 MCP 诊断</button></div>
      <div class="market-skill-list">
        ${snapshot.config.mcpServers.map((server) => {
          const diagnostic = mcpDiagnostic(server.id);
          return `
          <article class="market-skill-row">
            <div class="skill-glyph">${escapeHtml(server.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(server.name)}</strong>
              <p>${escapeHtml(server.description || `${server.command} ${server.args.join(" ")}`.trim() || "未提供描述")}</p>
              <small>${escapeHtml(server.id)} / ${escapeHtml(server.enabled ? "已启用" : "已停用")} / ${escapeHtml(mcpInUseBy(server.id) || "未授权给任何 Bot")}</small>
              ${diagnostic ? `<small>命令: ${escapeHtml(diagnostic.commandResolved || "未解析")} / 授权: ${escapeHtml(diagnostic.authorizedBotNames.join("、") || "无")}</small>` : ""}
              ${diagnostic?.protocol?.status === "ok" ? `<small class="mcp-tools">协议: OK / ${escapeHtml(String(diagnostic.protocol.durationMs ?? 0))}ms / tools: ${escapeHtml(diagnostic.protocol.tools.join("、") || "无")}</small>` : ""}
              ${diagnostic?.protocol?.status === "failed" ? `<small class="mcp-tools failed">协议: FAILED / ${escapeHtml(protocolFailureText(diagnostic.protocol))}</small>` : ""}
              ${diagnostic?.protocol?.status === "not-run" ? `<small class="mcp-tools">协议: 未探测，点击刷新诊断后执行短生命周期握手。</small>` : ""}
              ${diagnostic?.issues.length ? `<small class="diagnostic-issues">${escapeHtml(diagnostic.issues.join("；"))}</small>` : ""}
            </div>
            <span class="source-badge diagnostic-badge ${diagnostic?.status ?? "warn"}">${escapeHtml(diagnostic ? diagnosticLabel(diagnostic.status) : "CHECK")}</span>
          </article>`;
        }).join("") || `<div class="empty">当前没有 MCP 服务。前往配置页新增。</div>`}
      </div>
    </section>
    <section class="panel market-panel">
      <div class="panel-title"><span>SUITES</span><small>${suiteCount} imported</small></div>
      <div class="capability-note">套件用于把行业或角色相关的 Skill、自定义应用、MCP 和工作流说明组织成一个可挂载能力包。当前支持导入、预览和 Bot 挂载授权。</div>
      <div class="market-skill-list">
        ${snapshot.suites.map((suite) => {
          const inUseBy = snapshot.config.bots
            .filter((bot) => botHasCapability(bot, "suite", suite.id))
            .map((bot) => bot.name)
            .join("、");
          const flags = [
            suite.skills.length ? `${suite.skills.length} Skills` : "",
            suite.apps.length ? `${suite.apps.length} Apps` : "",
            suite.mcpServers.length ? `${suite.mcpServers.length} MCPs` : "",
            suite.workflows.length ? `${suite.workflows.length} Workflows` : ""
          ].filter(Boolean).join(" / ") || "空套件";
          return `
          <article class="market-skill-row" data-preview-suite="${escapeHtml(suite.id)}">
            <div class="skill-glyph">${escapeHtml(suite.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(suite.name)}</strong>
              <p>${escapeHtml(suite.description || "未提供描述")}</p>
              <small>${escapeHtml(suite.id)} / ${escapeHtml(flags)} / ${escapeHtml(inUseBy || "未授权给任何 Bot")}</small>
            </div>
            <div class="resource-actions">
              <span class="source-badge local">套件</span>
              ${resourceOpenButton("suite", suite.id)}
            </div>
          </article>`;
        }).join("") || `<div class="empty">当前没有套件。点击右上角导入包含 suite.json 的目录。</div>`}
      </div>
    </section>
    <section class="panel market-panel">
      <div class="panel-title"><span>CUSTOM APPS</span><small>${appCount} imported</small></div>
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
          return `
          <article class="market-skill-row" data-preview-custom-app="${escapeHtml(customApp.id)}">
            <div class="skill-glyph">${escapeHtml(customApp.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(customApp.name)}</strong>
              <p>${escapeHtml(customApp.description || "未提供描述")}</p>
              <small>${escapeHtml(customApp.id)} / v${escapeHtml(customApp.version)} / ${escapeHtml(flags)} / ${escapeHtml(inUseBy || "未授权给任何 Bot")}</small>
            </div>
            <div class="resource-actions">
              <span class="source-badge local">自定义应用</span>
              ${resourceOpenButton("app", customApp.id)}
            </div>
          </article>`;
        }).join("") || `<div class="empty">当前没有自定义应用。点击右上角导入包含 app.json 的目录。</div>`}
      </div>
    </section>
  `;
}

function renderSkills(): string {
  const localCount = snapshot.skills.filter((skill) => skill.source === "local").length;
  const marketCount = snapshot.skills.filter((skill) => skill.source === "market").length;
  const builtinCount = snapshot.skills.filter((skill) => skill.source === "builtin").length;
  return `
    <section class="metrics">
      <article><span>全部 Skills</span><strong>${snapshot.skills.length}</strong></article>
      <article><span>本地导入</span><strong>${localCount}</strong></article>
      <article><span>Git 市场</span><strong>${marketCount}</strong></article>
      <article><span>应用内置</span><strong>${builtinCount}</strong></article>
    </section>
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
        ${snapshot.skills.map((skill) => {
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
        }).join("") || `<div class="empty">当前没有可用 Skill。</div>`}
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

function renderSessionDetail(value: StorageSessionDetail): string {
  const botName = snapshot.config.bots.find((bot) => bot.id === value.botId)?.name || value.botId;
  const turns = value.transcript.length > 0
    ? value.transcript.map((turn, index) => {
      const events = (turn.events?.length ? turn.events : [
        { time: turn.time, type: "received" as const, title: "接收消息", body: turn.user },
        { time: turn.time, type: "reply" as const, title: "最终回复", body: turn.assistant }
      ]).map((event) => `
        <article class="session-event ${escapeHtml(event.type)}">
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
              <li>在 Bot 列表中新增机器人，选择飞书或企业微信消息平台并填写对应 App/Corp 凭据。</li>
              <li>按需点击“用户态 OAuth”，完成文档搜索、导出和读取所需的用户授权。</li>
              <li>给 Bot 勾选允许访问的 Skills，保存后到“运行台”启动监听。</li>
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
            <p>“配置”页支持新增全局 MCP 服务，当前支持 <code>stdio</code> 类型。需要填写命令、参数和可选环境变量，再到 Bot 编辑弹窗里显式勾选授权。</p>
            <p>当前版本会对当前 Bot 启用严格 MCP 配置模式，只把已授权 MCP 传给 Claude Agent SDK，不读取其他磁盘上的 MCP 配置来源。“能力”页会展示 MCP 诊断状态，包括命令解析、cwd、环境变量、Bot 授权、协议握手和工具列表预览。</p>
          </section>
          <section>
            <h3>机器人配置</h3>
            <p>配置页中的 Bot 以列表展示，点击行打开编辑弹窗。每个 Bot 拥有独立 IM CLI 状态、连接器状态、Claude home、会话 workspace 和 Skill 授权。</p>
            <p><strong>消息平台</strong>控制从飞书还是企业微信接收消息并默认回复。<strong>App ID / App Secret</strong>填写当前消息平台的应用凭据。</p>
            <p><strong>企业微信事件桥命令</strong>只在消息平台为企业微信时生效，用于运行一个本地事件桥并从 stdout 读取一行一个 JSON 的消息事件。官方 wecom-cli 当前是调用型工具，这个字段用于补齐监听入口。</p>
            <p><strong>飞书知识连接器</strong>用于消息入口不是飞书时仍然读取飞书文档、Wiki、云盘和云 PPT。<strong>结果投递路由</strong>可把最终回复复制发送到另一个平台 chat。</p>
            <p><strong>用户态 OAuth 额外权限</strong>用于补充飞书 scope，例如 <code>drive:export:readonly</code>、<code>docs:document:export</code>。保存后需要重新点击“用户态 OAuth”，并且飞书开放平台也必须先开通对应应用权限。</p>
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
            <p><code>app.json</code> 会声明入口、输入输出协议、可调用面和权限需求。授权前应确认入口和权限风险；自定义应用默认不能访问其他 Bot 的状态或 workspace。</p>
          </section>
          <section>
            <h3>套件</h3>
            <p>套件目录必须包含 <code>suite.json</code>。套件用于组合 Skills、自定义应用、MCP 和工作流说明，适合按角色或行业分发一组能力。</p>
            <p>当前版本支持导入、预览和 Bot 挂载授权。挂载套件不会自动扩大该 Bot 的底层 Skill、自定义应用或 MCP 权限；命令和普通 Agent 执行仍会按具体能力授权再校验。</p>
          </section>
          <section>
            <h3>MCP</h3>
            <p>MCP 服务在“配置”页按全局方式维护，当前支持 <code>stdio</code> 类型。配置完成后，还需要在 Bot 编辑弹窗里显式勾选授权。</p>
            <p>当前版本会把已授权 MCP 直接注入 Claude Agent SDK，并启用严格 MCP 配置模式，不读取其他磁盘上的 MCP 配置来源。能力页的 MCP 卡片会显示 OK/WARN/ERROR 诊断结果，并支持手动刷新静态诊断、协议握手和工具列表预览。</p>
          </section>
          <section>
            <h3>命令映射</h3>
            <p>Bot 编辑弹窗中的“命令映射”可把 <code>/xxx</code> 绑定到某个 Skill、套件、Workflow 或自定义应用。命令名只建议使用小写字母、数字、短横线和下划线。</p>
            <p>Skill 命令会把请求路由给目标 Skill；套件命令会把对应套件说明和工作流注入 Agent；Workflow 命令会按选定工作流执行，声明了 steps 时会顺序执行各步骤；自定义应用命令会直接执行目标应用。保留命令 <code>/new</code>、<code>/continue</code> 和 <code>/owner</code> 不能占用。</p>
            <p><strong>Prompt 模板</strong>可选，使用 <code>{{args}}</code> 引用命令参数，例如把 <code>/ppt 周报</code> 转成固定格式 prompt。</p>
          </section>
          <section>
            <h3>定时任务</h3>
            <p>Bot 编辑弹窗中的“定时任务”支持按 Bot 配置本机调度任务。当前支持 <code>interval</code>、<code>daily</code>、<code>weekly</code> 三种计划类型。</p>
            <p>任务目标可选 <code>agent</code>、<code>command</code>、<code>capability</code>。命令目标会复用该 Bot 已启用的命令映射；能力目标当前支持 Skill、套件、Workflow，以及声明 <code>scheduledCallable</code> 的自定义应用。</p>
            <p>定时任务结果会投递到指定 <code>chat_id</code>。任务只在应用运行期间触发，并与普通消息共享并发上限。已保存且启用的任务可在 Bot 编辑弹窗中立即运行；最近运行结果可在“存储管理”的定时任务运行历史中查看，并可按 Bot 和状态筛选；Workflow 任务会展示步骤摘要。</p>
          </section>
          <section>
            <h3>运行台</h3>
            <p>运行台显示在线 Bot、可用 Skills、运行中任务和排队任务。点击 Bot 可查看该 Bot 的独立日志，并按日志等级筛选。</p>
            <p>收到 IM 消息后，应用会尽量给原消息添加处理中标记；平台不支持时会静默跳过。处理完成后回复结果。多人同时提问时，超出并发上限的任务会排队。</p>
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
            <p>文件缓存位于应用级内容哈希缓存中，用于复用飞书消息附件、受控 helper 下载或导出的飞书文件，以及 Agent 生成文件。存储管理会只读展示缓存索引，可按 Bot 和来源筛选，但不会暴露全局缓存目录路径。清理缓存不会删除会话记录；清理会话也不会删除应用配置、飞书授权、Skill 市场配置或用户导入 Skills。</p>
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
      <article><span>连续会话</span><strong>${storage.sessionCount}</strong></article>
    </section>
    <section class="storage-grid">
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
      <div class="panel storage-card">
        <div class="panel-title"><span>EXPIRED SESSION CLEANUP</span><small>24 小时无活动</small></div>
        <p>清理已过期会话的独立 workspace、消息附件和 Claude 会话记录。不会删除机器人配置、飞书授权或用户导入的 Skills。</p>
        <button class="ghost" id="clear-expired" ${storage.expiredSessionCount === 0 ? "disabled" : ""}>清理 ${storage.expiredSessionCount} 个过期会话</button>
      </div>
      <div class="panel storage-card">
        <div class="panel-title"><span>FILE CACHE</span><small>${formatBytes(storage.cacheBytes)}</small></div>
        <p>清理应用级内容哈希缓存。缓存用于复用飞书下载的大文件和 Agent 生成文件；清理后不会删除会话记录，但后续需要时会重新下载或生成。</p>
        <button class="ghost" id="clear-file-cache" ${storage.cacheBytes === 0 ? "disabled" : ""}>清理文件缓存</button>
      </div>
      <div class="panel storage-card danger-zone">
        <div class="panel-title"><span>ALL SESSION DATA</span><small>不可恢复</small></div>
        <p>清理全部会话上下文、workspace 和已下载消息附件。文件缓存需单独清理；机器人配置、飞书授权与用户 Skills 会保留。</p>
        <button class="danger" id="clear-all-storage">清理全部会话数据</button>
      </div>
    </section>
    <section class="panel scheduled-runs-panel">
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
              <small>${escapeHtml(entry.label)}${entry.freshnessKey ? ` / ${escapeHtml(entry.freshnessKey)}` : ""}</small>
            </div>
          </article>`).join("") || `<div class="empty">${storage.cacheEntries.length === 0 ? "当前没有可展示的文件缓存索引。消息附件或受控文件 helper 命中后会在这里出现。" : "当前筛选条件下没有缓存索引。"}</div>`}
      </div>
    </section>
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
        ${visibleRuns.map((run) => `
          <article class="run-history-row ${escapeHtml(run.status)}">
            <div class="run-status ${escapeHtml(run.status)}">${runStatusLabel(run.status)}</div>
            <div>
              <strong>${escapeHtml(run.taskName)}</strong>
              <p>${escapeHtml(run.botName)} / ${new Date(run.startedAt).toLocaleString()} / ${formatDuration(runDurationMs(run))}</p>
              ${run.detail ? `<pre>${escapeHtml(run.detail)}</pre>` : `<small>无运行详情。</small>`}
            </div>
          </article>`).join("") || `<div class="empty">${scheduledRuns.length === 0 ? "当前没有定时任务运行记录。任务触发后会显示最近运行状态和 Workflow 步骤摘要。" : "当前筛选条件下没有运行记录。"}</div>`}
      </div>
    </section>
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
    <section class="workspace">
      <div class="panel skill-panel">
        <div class="panel-title"><span>BOT REGISTRY</span><small>${snapshot.config.bots.length} configured</small></div>
        <div class="skill-list bot-registry">
          ${snapshot.config.bots.map((bot) => `
            <div class="skill bot-runtime-card ${selectedBot?.id === bot.id ? "selected" : ""}" data-select-bot="${escapeHtml(bot.id)}">
              <div class="skill-glyph">${escapeHtml(bot.name.slice(0, 2).toUpperCase())}</div>
              <div class="bot-runtime-main">
                <strong>${statusDot(snapshot.connectedBotIds.includes(bot.id))}${escapeHtml(bot.name)}</strong>
                <p>${bot.skillNames.length} 个 Skill / ${bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0} 个能力引用 / ${snapshot.runningBotIds.includes(bot.id) ? "监听中" : bot.enabled ? "未启动" : "已停用"}</p>
              </div>
              ${snapshot.runningBotIds.includes(bot.id)
                ? `<button class="danger bot-stop" data-id="${escapeHtml(bot.id)}">停止</button>`
                : `<button class="primary bot-start" data-id="${escapeHtml(bot.id)}" ${botCanStart(bot) ? "" : "disabled"}>启动</button>`}
            </div>`).join("") || `<div class="empty">前往配置页添加机器人。</div>`}
        </div>
      </div>
      <div class="panel log-panel">
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
  return `
    <div class="modal-backdrop" id="bot-editor-backdrop">
      <section class="release-modal bot-editor-modal" role="dialog" aria-modal="true">
        <div class="release-modal-header">
          <div>
            <p class="eyebrow">BOT CONFIGURATION</p>
            <h2>${escapeHtml(bot.name || "未命名机器人")}</h2>
          </div>
          <button type="button" class="ghost" id="close-bot-editor">关闭</button>
        </div>
        <form id="bot-editor-form" class="bot-editor-body">
      <div class="field-row">
        ${botField(bot, "机器人名称", "name", "text", "botName")}
        <label><span>启用${helpButton("botEnabled")}</span><select data-edit-bot-field="enabled"><option value="true" ${bot.enabled ? "selected" : ""}>启用</option><option value="false" ${!bot.enabled ? "selected" : ""}>停用</option></select></label>
      </div>
      <label><span>消息平台${helpButton("imProvider")}</span><select data-edit-bot-field="provider">
        <option value="lark" ${(bot.provider ?? "lark") === "lark" ? "selected" : ""}>飞书</option>
        <option value="wecom" ${bot.provider === "wecom" ? "selected" : ""}>企业微信</option>
        <option value="dingtalk" ${bot.provider === "dingtalk" ? "selected" : ""} disabled>钉钉（预留）</option>
      </select><small>消息入口和默认回复平台。知识库和结果转发可以通过连接器和投递路由配置到其他平台。</small></label>
      ${botField(bot, "App ID", "appId")}
      ${botField(bot, "App Secret", "appSecret", "password")}
      <label><span>企业微信事件桥命令${helpButton("wecomEventCommand")}</span><textarea id="wecom-event-command" rows="2" placeholder="/path/to/wecom-event-bridge --bot wecom-1">${escapeHtml(bot.providerOptions?.eventCommand ?? "")}</textarea><small>仅消息平台为企业微信时生效。命令需持续输出一行一个 JSON 事件，应用会按 Bot 隔离运行并归一化为消息。</small></label>
      <div class="field-row">
        <label><span>接收身份${helpButton("receiveIdentity")}</span><select data-edit-bot-field="receiveIdentity"><option value="bot" ${bot.receiveIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.receiveIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
        <label><span>回复身份${helpButton("replyIdentity")}</span><select data-edit-bot-field="replyIdentity"><option value="bot" ${bot.replyIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.replyIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
      </div>
      ${botField(bot, "处理中表情", "pendingReaction")}
      ${botField(bot, "Owner 飞书 open_id", "ownerOpenId")}
      <div class="field-row">
        ${botField(bot, "长任务提示秒数", "longTaskNoticeSeconds", "number")}
        ${botField(bot, "长任务提示文案", "longTaskNoticeText", "text")}
      </div>
      ${botTextarea(bot, "用户态 OAuth 额外权限", "oauthScopes", "默认会申请 search:docs:read；这里可填写额外 scope，支持空格、逗号或换行分隔，例如 drive:export:readonly、docs:document:export。修改后需重新点击用户态 OAuth。")}
      <div class="skill-access">
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
      <div class="skill-access">
        <div class="skill-access-heading"><span>结果投递路由${helpButton("deliveryRoutes")}</span><small>${bot.deliveryRoutes?.filter((route) => route.enabled).length ?? 0} enabled</small></div>
        <small>主回复仍回到原消息；这里可把最终结果复制投递到另一个平台 chat，例如企业微信收到问题后同步发送到飞书群。</small>
        <div class="command-binding-list">
          ${(bot.deliveryRoutes ?? []).map((route, index) => `
            <div class="command-binding-row">
              <label><span>名称</span><input data-route-name="${index}" value="${escapeHtml(route.name ?? "")}" placeholder="例如 同步到飞书群" /></label>
              <label><span>平台</span><select data-route-provider="${index}">
                <option value="lark" ${route.provider === "lark" ? "selected" : ""}>飞书</option>
                <option value="wecom" ${route.provider === "wecom" ? "selected" : ""}>企业微信</option>
              </select></label>
              <label><span>启用</span><select data-route-enabled="${index}"><option value="true" ${route.enabled ? "selected" : ""}>启用</option><option value="false" ${!route.enabled ? "selected" : ""}>停用</option></select></label>
              <label class="command-wide"><span>Chat ID</span><input data-route-chat-id="${index}" value="${escapeHtml(route.chatId)}" placeholder="目标平台 chat_id" /></label>
              <button type="button" class="danger remove-delivery-route" data-index="${index}">删除路由</button>
            </div>`).join("") || `<div class="empty">当前没有额外投递路由。</div>`}
        </div>
        <div class="form-actions inline-actions"><button type="button" class="ghost add-delivery-route" data-id="${bot.id}">新增投递路由</button></div>
      </div>
      <label><span>向用户展示工作过程${helpButton("showProgress")}</span><select data-edit-bot-field="showProgress"><option value="false" ${!bot.showProgress ? "selected" : ""}>关闭</option><option value="true" ${bot.showProgress ? "selected" : ""}>开启</option></select><small>展示工具调用和检索进度，不泄露模型私有推理。</small></label>
      <small class="bot-note">Agent 无法解决或需要人工授权时，会私聊此用户发送卡片。Owner 必须在飞书中有该应用的使用权限。</small>
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
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的 MCP${helpButton("mcpAccess")}</span><small>${bot.capabilityRefs?.filter((ref) => ref.kind === "mcp" && ref.enabled).length ?? 0} / ${snapshot.config.mcpServers.length} 已授权</small></div>
        <small>MCP 服务是全局配置、本机运行的工具能力。只有勾选后才会进入该 Bot 的 Claude Agent 上下文。</small>
        <div class="skill-check-list">
          ${snapshot.config.mcpServers.map((server) => `<label class="check"><input type="checkbox" data-edit-bot-mcp="${bot.id}" value="${escapeHtml(server.id)}" ${botHasCapability(bot, "mcp", server.id) ? "checked" : ""}/><span><strong>${escapeHtml(server.name)}</strong><small>${escapeHtml(server.id)} / ${escapeHtml(server.description || server.command)}</small></span></label>`).join("") || `<small>请先在配置页新增 MCP 服务。</small>`}
        </div>
      </div>
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的自定义应用${helpButton("customAppAccess")}</span><small>${bot.capabilityRefs?.filter((ref) => ref.kind === "app" && ref.enabled).length ?? 0} / ${snapshot.customApps.length} 已授权</small></div>
        <small>自定义应用导入后默认不授权。授权只记录 capability 引用，后续命令和定时任务会复用这层治理边界。</small>
        <div class="skill-check-list">
          ${snapshot.customApps.map((customApp) => `<label class="check"><input type="checkbox" data-edit-bot-app="${bot.id}" value="${escapeHtml(customApp.id)}" ${botHasCapability(bot, "app", customApp.id) ? "checked" : ""}/><span><strong>${escapeHtml(customApp.name)}</strong><small>${escapeHtml(customApp.id)} / ${escapeHtml(customApp.description || "自定义应用")}</small></span></label>`).join("") || `<small>请先在“能力”页导入自定义应用。</small>`}
        </div>
      </div>
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的套件${helpButton("suiteAccess")}</span><small>${bot.capabilityRefs?.filter((ref) => ref.kind === "suite" && ref.enabled).length ?? 0} / ${snapshot.suites.length} 已授权</small></div>
        <small>套件挂载用于角色化和行业化能力编排，不自动替代底层 Skill、自定义应用或 MCP 授权；套件命令和普通 Agent 只会看到其中已实际授权的子能力。</small>
        <div class="skill-check-list">
          ${snapshot.suites.map((suite) => `<label class="check"><input type="checkbox" data-edit-bot-suite="${bot.id}" value="${escapeHtml(suite.id)}" ${botHasCapability(bot, "suite", suite.id) ? "checked" : ""}/><span><strong>${escapeHtml(suite.name)}</strong><small>${escapeHtml(suite.id)} / ${escapeHtml(suite.description || "套件")}</small></span></label>`).join("") || `<small>请先在“能力”页导入套件。</small>`}
        </div>
      </div>
      <div class="skill-access">
        <div class="skill-access-heading"><span>命令映射${helpButton("commandBindings")}</span><small>${bot.commandBindings?.filter((binding) => binding.enabled).length ?? 0} enabled</small></div>
        <small>命令会在收到 <code>/xxx 参数</code> 时优先执行。Skill 命令会只把请求交给目标 Skill；Suite 命令会在目标套件上下文中执行；Workflow 命令会按工作流 prompt 或 steps 执行；App 命令会直接执行目标自定义应用。</small>
        <div class="command-binding-list">
          ${(bot.commandBindings ?? []).map((binding, index) => `
            <div class="command-binding-row">
              <label><span>命令名</span><input data-command-name="${index}" value="${escapeHtml(binding.name)}" placeholder="例如 ppt" /></label>
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
      <div class="skill-access">
        <div class="skill-access-heading"><span>定时任务${helpButton("scheduledTasks")}</span><small>${bot.scheduledTasks?.filter((task) => task.enabled).length ?? 0} enabled</small></div>
        <small>定时任务会在应用运行期间由本机调度执行，并把结果投递到指定 chat_id。命令目标要求先配置并启用对应命令；能力目标当前支持 Skill、套件、Workflow 和声明 scheduledCallable 的自定义应用。</small>
        <div class="command-binding-list">
          ${(bot.scheduledTasks ?? []).map((task, index) => `
            <div class="command-binding-row scheduled-task-row">
              <label><span>任务名</span><input data-task-name="${index}" value="${escapeHtml(task.name)}" placeholder="例如 每日质量日报" /></label>
              <label><span>计划类型</span><select data-task-schedule-type="${index}">
                <option value="interval" ${task.schedule.type === "interval" ? "selected" : ""}>interval</option>
                <option value="daily" ${task.schedule.type === "daily" ? "selected" : ""}>daily</option>
                <option value="weekly" ${task.schedule.type === "weekly" ? "selected" : ""}>weekly</option>
              </select></label>
              <label><span>启用</span><select data-task-enabled="${index}"><option value="true" ${task.enabled ? "selected" : ""}>启用</option><option value="false" ${!task.enabled ? "selected" : ""}>停用</option></select></label>
              <label><span>时区</span><input data-task-timezone="${index}" value="${escapeHtml(task.schedule.timezone)}" placeholder="Asia/Shanghai" /></label>
              <label><span>间隔分钟</span><input data-task-every-minutes="${index}" type="number" min="5" value="${escapeHtml(task.schedule.everyMinutes ?? 60)}" /></label>
              <label><span>时间点</span><input data-task-time-of-day="${index}" value="${escapeHtml(task.schedule.timeOfDay ?? "09:00")}" placeholder="09:00" /></label>
              <label class="command-wide"><span>周几</span><input data-task-weekdays="${index}" value="${escapeHtml((task.schedule.weekdays ?? [1]).join(","))}" placeholder="0-6，逗号分隔；0=周日" /></label>
              <label><span>目标类型</span><select data-task-target-type="${index}">
                <option value="agent" ${task.target.type === "agent" ? "selected" : ""}>agent</option>
                <option value="command" ${task.target.type === "command" ? "selected" : ""}>command</option>
                <option value="capability" ${task.target.type === "capability" ? "selected" : ""}>capability</option>
              </select></label>
              <label><span>命令目标</span><select data-task-command-name="${index}">
                ${scheduledCommandOptions(bot).map((name) => `<option value="${escapeHtml(name)}" ${name === task.target.commandName ? "selected" : ""}>/${escapeHtml(name)}</option>`).join("")}
              </select></label>
              <label><span>能力目标</span><select data-task-capability="${index}">
                ${scheduledCapabilityOptions(bot).map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === `${task.target.capability?.kind ?? ""}:${task.target.capability?.id ?? ""}` ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select></label>
              <label class="command-wide"><span>Prompt</span><input data-task-prompt="${index}" value="${escapeHtml(task.target.prompt)}" placeholder="输入定时执行时使用的 prompt" /></label>
              <label class="command-wide"><span>投递 chat_id</span><input data-task-chat-id="${index}" value="${escapeHtml(task.delivery.chatId)}" placeholder="oc_xxx" /></label>
              <div class="scheduled-task-actions">
                <button type="button" class="ghost run-scheduled-task" data-bot-id="${escapeHtml(bot.id)}" data-task-id="${escapeHtml(task.id)}" ${task.enabled ? "" : "disabled"}>立即运行</button>
                <button type="button" class="danger remove-scheduled-task" data-index="${index}">删除任务</button>
              </div>
            </div>`).join("") || `<div class="empty">当前没有定时任务。</div>`}
        </div>
        <div class="form-actions inline-actions"><button type="button" class="ghost add-scheduled-task" data-id="${bot.id}">新增定时任务</button></div>
      </div>
      <div class="form-actions bot-editor-actions">
        <button type="button" class="ghost oauth-bot" data-id="${bot.id}" ${(bot.provider ?? "lark") === "lark" ? "" : "disabled"}>${(bot.provider ?? "lark") === "lark" ? "用户态 OAuth" : "飞书主平台 OAuth"}</button>
        <button type="button" class="danger remove-bot" data-id="${bot.id}">删除</button>
        <button type="submit" class="primary">保存 Bot 配置</button>
      </div>
        </form>
      </section>
    </div>
  `;
}

function renderConfig(): string {
  const c = snapshot.config;
  return `
    <form id="config-form">
      <section class="config-grid">
        <div class="panel config-panel">
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
        <div class="panel config-panel">
          <div class="panel-title"><span>SKILL MARKET</span><small>Built-in Git client / HTTPS</small></div>
          <label><span>启用技能市场${helpButton("marketEnabled")}</span><select name="marketEnabled"><option value="true" ${c.skillMarket.enabled ? "selected" : ""}>启用</option><option value="false" ${!c.skillMarket.enabled ? "selected" : ""}>停用</option></select></label>
          ${field("HTTPS Git 仓库", "marketRepositoryUrl", c.skillMarket.repositoryUrl, "url", "应用内置 Git 客户端，不依赖本机 Git；仅支持 HTTPS URL")}
          ${field("分支", "marketBranch", c.skillMarket.branch)}
          ${field("访问 Token（可选）", "marketToken", c.skillMarket.token, "password", "私有仓库使用；仅保存在本机配置")}
          <div class="form-actions"><button type="button" class="ghost" id="sync-market" ${c.skillMarket.enabled && c.skillMarket.repositoryUrl ? "" : "disabled"}>立即同步技能市场</button></div>
        </div>
        <div class="panel config-panel">
          <div class="panel-title"><span>MCP SERVERS ${helpButton("mcpServers")}</span><small>${c.mcpServers.length} configured</small></div>
          <div class="command-binding-list config-inline-list">
            ${c.mcpServers.map((server, index) => `
              <div class="command-binding-row">
                <label><span>名称</span><input data-mcp-name="${index}" value="${escapeHtml(server.name)}" placeholder="例如 质量库" /></label>
                <label><span>ID</span><input data-mcp-id="${index}" value="${escapeHtml(server.id)}" placeholder="quality-db" /></label>
                <label><span>启用</span><select data-mcp-enabled="${index}"><option value="true" ${server.enabled ? "selected" : ""}>启用</option><option value="false" ${!server.enabled ? "selected" : ""}>停用</option></select></label>
                <label class="command-wide"><span>命令</span><input data-mcp-command="${index}" value="${escapeHtml(server.command)}" placeholder="node" /></label>
                <label class="command-wide"><span>参数</span><input data-mcp-args="${index}" value="${escapeHtml(server.args.join(" "))}" placeholder="dist/server.js --mode prod" /></label>
                <label class="command-wide"><span>环境变量</span><input data-mcp-env="${index}" value="${escapeHtml(server.env.map((item) => `${item.name}=${item.value}`).join("\n"))}" placeholder="TOKEN=xxx" /></label>
                <label><span>超时(ms)</span><input data-mcp-timeout="${index}" type="number" min="1000" value="${escapeHtml(server.timeoutMs ?? "")}" placeholder="5000" /></label>
                <label><span>始终加载</span><select data-mcp-always-load="${index}"><option value="false" ${!server.alwaysLoad ? "selected" : ""}>否</option><option value="true" ${server.alwaysLoad ? "selected" : ""}>是</option></select></label>
                <label class="command-wide"><span>说明</span><input data-mcp-description="${index}" value="${escapeHtml(server.description ?? "")}" placeholder="说明此 MCP 服务用途" /></label>
                <button type="button" class="danger remove-mcp-server" data-index="${index}">删除 MCP</button>
              </div>`).join("") || `<div class="empty">当前没有 MCP 服务。</div>`}
          </div>
          <div class="form-actions inline-actions"><button type="button" class="ghost" id="add-mcp-server">新增 MCP</button></div>
        </div>
        <div class="panel config-panel">
          <div class="panel-title"><span>BOT REGISTRY ${helpButton("botList")}</span><small>${c.bots.length} configured</small></div>
          <div class="config-bot-list">
            ${c.bots.map((bot) => `
              <button type="button" class="config-bot-row" data-edit-bot="${escapeHtml(bot.id)}">
                <span>${statusDot(bot.enabled)}<strong>${escapeHtml(bot.name || "未命名机器人")}</strong></span>
                <small>${escapeHtml((bot.provider ?? "lark") === "wecom" ? "企业微信" : "飞书")} / ${escapeHtml(bot.appId || "未配置 App ID")} / ${bot.skillNames.length} Skills / ${bot.capabilityRefs?.filter((ref) => ref.enabled).length ?? 0} capability refs / ${bot.oauthScopes?.length ?? 0} extra scopes</small>
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
      preview = { title: `${value.app.name} / ${value.app.id}`, body: `${value.manifest}\n\nFILES\n${value.files.join("\n")}` };
      render();
    };
  });
  document.querySelectorAll<HTMLElement>("[data-preview-suite]").forEach((row) => {
    row.onclick = async () => {
      const value: SuitePreview = await window.quarkfanTools.suitePreview(String(row.dataset.previewSuite));
      preview = { title: `${value.suite.name} / ${value.suite.id}`, body: `${value.manifest}\n\nFILES\n${value.files.join("\n")}` };
      render();
    };
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
  document.querySelector<HTMLSelectElement>("#market-source")?.addEventListener("change", (event) => {
    marketSource = (event.currentTarget as HTMLSelectElement).value;
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
      editingBotId = String(button.dataset.editBot);
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
      snapshot = await window.quarkfanTools.startBot(selectedBotId);
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
      preview = { title: `会话 ${value.conversationKey}`, html: renderSessionDetail(value) };
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#refresh-mcp-diagnostics")?.addEventListener("click", async () => {
    mcpDiagnostics = await window.quarkfanTools.mcpDiagnostics(true);
    render();
  });
  document.querySelector<HTMLButtonElement>("#close-preview")?.addEventListener("click", () => { preview = null; render(); });
  document.querySelector<HTMLElement>("#preview-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) { preview = null; render(); }
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
    render();
  });
  document.querySelector<HTMLButtonElement>("#close-bot-editor")?.addEventListener("click", () => {
    editingBotId = "";
    render();
  });
  document.querySelector<HTMLElement>("#bot-editor-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) { editingBotId = ""; render(); }
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-bot").forEach((button) => {
    button.onclick = async () => {
      const bot = snapshot.config.bots.find((item) => item.id === button.dataset.id);
      if (!window.confirm(`确认删除机器人“${bot?.name || button.dataset.id}”？`)) return;
      const next = structuredClone(snapshot.config);
      next.bots = next.bots.filter((item) => item.id !== button.dataset.id);
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = "";
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".oauth-bot").forEach((button) => {
    button.onclick = () => void window.quarkfanTools.loginLarkUser(String(button.dataset.id));
  });
  document.querySelector<HTMLButtonElement>("#add-mcp-server")?.addEventListener("click", async () => {
    const next = structuredClone(snapshot.config);
    next.mcpServers.push({
      id: `mcp-${next.mcpServers.length + 1}`,
      name: `MCP ${next.mcpServers.length + 1}`,
      enabled: true,
      transport: "stdio",
      command: "",
      args: [],
      env: []
    });
    snapshot = await window.quarkfanTools.saveConfig(next);
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
            kind: kind as "skill" | "app" | "suite" | "workflow",
            id
          }
        }
      }];
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
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
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".add-delivery-route").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === button.dataset.id);
      if (!bot) return;
      bot.deliveryRoutes = [...(bot.deliveryRoutes ?? []), {
        id: crypto.randomUUID(),
        enabled: true,
        provider: "lark",
        chatId: "",
        mode: "copy-final-reply",
        name: `投递路由 ${(bot.deliveryRoutes?.length ?? 0) + 1}`
      }];
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
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
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".add-scheduled-task").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === button.dataset.id);
      if (!bot) return;
      const commandName = scheduledCommandOptions(bot)[0] ?? "";
      const capabilityValue = scheduledCapabilityOptions(bot)[0]?.value ?? "skill:";
      const [kind, id] = capabilityValue.split(":");
      bot.scheduledTasks = [...(bot.scheduledTasks ?? []), {
        id: crypto.randomUUID(),
        botId: bot.id,
        enabled: true,
        name: `定时任务 ${(bot.scheduledTasks?.length ?? 0) + 1}`,
        schedule: { type: "daily", timezone: "Asia/Shanghai", timeOfDay: "09:00" },
        target: { type: "agent", commandName, capability: id ? { kind: kind as "skill" | "app" | "suite" | "workflow", id } : undefined, prompt: "请执行定时任务" },
        delivery: { type: "chat", chatId: "" }
      }];
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-scheduled-task").forEach((button) => {
    button.onclick = async () => {
      const next = structuredClone(snapshot.config);
      const bot = next.bots.find((item) => item.id === editingBotId);
      if (!bot) return;
      bot.scheduledTasks = (bot.scheduledTasks ?? []).filter((_, index) => index !== Number(button.dataset.index));
      snapshot = await window.quarkfanTools.saveConfig(next);
      editingBotId = bot.id;
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
    bot.providerOptions = { ...(bot.providerOptions ?? {}) };
    if (wecomEventCommand) {
      bot.providerOptions.eventCommand = wecomEventCommand;
    } else {
      delete bot.providerOptions.eventCommand;
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
        if (!chatId) return null;
        const route = (bot.deliveryRoutes ?? [])[index];
        return {
          id: route?.id ?? crypto.randomUUID(),
          enabled: (document.querySelector<HTMLSelectElement>(`[data-route-enabled="${index}"]`)?.value ?? "true") === "true",
          provider: (document.querySelector<HTMLSelectElement>(`[data-route-provider="${index}"]`)?.value ?? "lark") as NonNullable<BotConfig["deliveryRoutes"]>[number]["provider"],
          chatId,
          mode: "copy-final-reply" as const,
          name: document.querySelector<HTMLInputElement>(`[data-route-name="${index}"]`)?.value.trim() || undefined
        };
      })
      .filter((route): route is NonNullable<BotConfig["deliveryRoutes"]>[number] => Boolean(route));
    const selectedMcps = new Set([...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-mcp="${editingBotId}"]:checked`)].map((input) => input.value));
    const selectedApps = new Set([...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-app="${editingBotId}"]:checked`)].map((input) => input.value));
    const selectedSuites = new Set([...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-suite="${editingBotId}"]:checked`)].map((input) => input.value));
    const existingNonManagedRefs = (bot.capabilityRefs ?? []).filter((ref) => !["app", "suite", "mcp"].includes(ref.kind));
    bot.capabilityRefs = [
      ...existingNonManagedRefs,
      ...[...selectedMcps].map((id) => ({
        kind: "mcp" as const,
        id,
        enabled: true,
        policy: {
          allowAgentUse: true,
          allowCommandUse: false,
          allowScheduledUse: false
        }
      })),
      ...[...selectedApps].map((id) => ({
        kind: "app" as const,
        id,
        enabled: true,
        policy: {
          allowAgentUse: true,
          allowCommandUse: true,
          allowScheduledUse: true
        }
      })),
      ...[...selectedSuites].map((id) => ({
        kind: "suite" as const,
        id,
        enabled: true,
        policy: {
          allowAgentUse: true,
          allowCommandUse: true,
          allowScheduledUse: true
        }
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
          enabled: (document.querySelector<HTMLSelectElement>(`[data-command-enabled="${index}"]`)?.value ?? "true") === "true",
          description: document.querySelector<HTMLInputElement>(`[data-command-description="${index}"]`)?.value.trim() || undefined,
          promptTemplate: document.querySelector<HTMLInputElement>(`[data-command-template="${index}"]`)?.value.trim() || undefined,
          target: {
            type: "capability" as const,
            capability: {
              kind: kind as "skill" | "app" | "suite" | "workflow",
              id
            }
          }
        };
      })
      .filter((binding): binding is NonNullable<BotConfig["commandBindings"]>[number] => Boolean(binding));
    bot.scheduledTasks = [...document.querySelectorAll<HTMLInputElement>("[data-task-name]")]
      .map((input, index) => {
        const name = input.value.trim();
        const scheduleType = (document.querySelector<HTMLSelectElement>(`[data-task-schedule-type="${index}"]`)?.value ?? "daily") as ScheduledTask["schedule"]["type"];
        const timezone = document.querySelector<HTMLInputElement>(`[data-task-timezone="${index}"]`)?.value.trim() || "Asia/Shanghai";
        const prompt = document.querySelector<HTMLInputElement>(`[data-task-prompt="${index}"]`)?.value.trim() || "";
        const chatId = document.querySelector<HTMLInputElement>(`[data-task-chat-id="${index}"]`)?.value.trim() || "";
        const targetType = (document.querySelector<HTMLSelectElement>(`[data-task-target-type="${index}"]`)?.value ?? "agent") as ScheduledTask["target"]["type"];
        if (!name || !prompt || !chatId) return null;
        const task = (bot.scheduledTasks ?? [])[index];
        const normalized: ScheduledTask = {
          id: task?.id ?? crypto.randomUUID(),
          botId: bot.id,
          enabled: (document.querySelector<HTMLSelectElement>(`[data-task-enabled="${index}"]`)?.value ?? "true") === "true",
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
          }
        };
        if (scheduleType === "interval") normalized.schedule.everyMinutes = Math.max(5, Number(document.querySelector<HTMLInputElement>(`[data-task-every-minutes="${index}"]`)?.value ?? 60) || 60);
        if (scheduleType === "daily" || scheduleType === "weekly") normalized.schedule.timeOfDay = document.querySelector<HTMLInputElement>(`[data-task-time-of-day="${index}"]`)?.value.trim() || "09:00";
        if (scheduleType === "weekly") {
          normalized.schedule.weekdays = [...new Set((document.querySelector<HTMLInputElement>(`[data-task-weekdays="${index}"]`)?.value ?? "")
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))];
        }
        if (targetType === "command") normalized.target.commandName = document.querySelector<HTMLSelectElement>(`[data-task-command-name="${index}"]`)?.value.trim() || "";
        if (targetType === "capability") {
          const raw = document.querySelector<HTMLSelectElement>(`[data-task-capability="${index}"]`)?.value ?? "";
          const [kind, id] = raw.split(":");
          if (kind && id) normalized.target.capability = { kind: kind as "skill" | "app" | "suite" | "workflow", id };
        }
        return normalized;
      })
      .filter((task): task is ScheduledTask => Boolean(task));
    snapshot = await window.quarkfanTools.saveConfig(next);
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
    next.mcpServers = [...document.querySelectorAll<HTMLInputElement>("[data-mcp-name]")]
      .map((input, index) => {
        const id = document.querySelector<HTMLInputElement>(`[data-mcp-id="${index}"]`)?.value.trim() || "";
        const name = input.value.trim();
        const command = document.querySelector<HTMLInputElement>(`[data-mcp-command="${index}"]`)?.value.trim() || "";
        if (!id || !name || !command) return null;
        return {
          id,
          name,
          enabled: (document.querySelector<HTMLSelectElement>(`[data-mcp-enabled="${index}"]`)?.value ?? "true") === "true",
          transport: "stdio" as const,
          command,
          args: (document.querySelector<HTMLInputElement>(`[data-mcp-args="${index}"]`)?.value ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean),
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
  [snapshot, logs, storage, scheduledRuns, mcpDiagnostics, applicationInfo] = await Promise.all([
    window.quarkfanTools.snapshot(),
    window.quarkfanTools.logs(),
    window.quarkfanTools.storageStats(),
    window.quarkfanTools.scheduledRuns(),
    window.quarkfanTools.mcpDiagnostics(),
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
