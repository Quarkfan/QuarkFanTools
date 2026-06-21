import "./style.css";
import type { AppConfig, AppInfo, BotConfig, LogEntry, RuntimeSnapshot, ScheduledTask, SkillPreview, StorageSessionDetail, StorageStats } from "../electron/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: RuntimeSnapshot;
let logs: LogEntry[] = [];
let storage: StorageStats;
let scheduledTasks: ScheduledTask[] = [];
let applicationInfo: AppInfo;
let activeView: "console" | "skills" | "automation" | "config" | "storage" = "console";
let selectedBotId = "";
let selectedAutomationBotId = "";
let logLevel: "all" | LogEntry["level"] = "all";
let showReleaseNotes = false;
let marketSource = "all";
let marketSearch = "";
let preview: { title: string; body: string } | null = null;
let editingBotId = "";
let helpTopicKey = "";
let showManual = false;
let logCopyState = "";

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
  botIsolationMode: { title: "Bot 运行隔离", body: "1.7.0 起每个 Bot 由独立 worker 进程承载。Docker/自动模式会先记录配置和诊断能力，容器 driver 后续接入。" },
  preventSleepMode: { title: "防休眠", body: "可在 Bot 运行或任务繁忙时阻止系统自动休眠。不能阻止用户手动合盖、关机或强制睡眠。" },
  multimodalEnabled: { title: "多模态视觉能力", body: "开启后图片消息和 PowerPoint 预览可作为视觉输入交给模型；关闭后只处理文本内容。" },
  marketEnabled: { title: "启用技能市场", body: "启用后可从 HTTPS Git 仓库同步 Skill。同步后的 Skill 默认不授权给任何 Bot。" },
  marketRepositoryUrl: { title: "HTTPS Git 仓库", body: "Skill 市场仓库地址。当前只支持 HTTPS，不依赖系统 Git 或 SSH Key。" },
  marketBranch: { title: "分支", body: "同步 Skill 市场时使用的 Git 分支。" },
  marketToken: { title: "访问 Token", body: "私有 Skill 市场仓库的访问 Token。仅保存在本机配置中。" },
  botList: { title: "Bot 列表", body: "每个 Bot 拥有独立飞书 CLI 状态、Claude home、会话 workspace 和 Skill 授权。点击行可编辑详细配置。" },
  botName: { title: "机器人名称", body: "界面和日志中展示的名称，不影响飞书开放平台配置。" },
  botEnabled: { title: "启用", body: "停用后该 Bot 不会启动监听，也不会作为可运行机器人计入配置检查。" },
  appId: { title: "App ID", body: "飞书开放平台应用的 App ID，例如 cli_xxx。不同 Bot 可使用不同应用。" },
  appSecret: { title: "App Secret", body: "飞书开放平台应用密钥，用于初始化 Bot 态能力。仅保存在本机配置中。" },
  receiveIdentity: { title: "接收身份", body: "飞书事件监听使用的身份。一般使用 Bot；只有明确需要用户态事件时再切换。" },
  replyIdentity: { title: "回复身份", body: "机器人回复消息、表情和文件时使用的身份。Bot 态通常更稳定。" },
  pendingReaction: { title: "处理中表情", body: "收到消息后添加到原消息上的反应名称，任务结束后会移除，用于替代“正在查询”文本。" },
  ownerOpenId: { title: "Owner 飞书 open_id", body: "Agent 无法解决或需要人工处理时，会向该用户私聊发送处理卡片。" },
  oauthScopes: { title: "用户态 OAuth 额外权限", body: "默认会申请 search:docs:read。这里填写额外 scope 后，保存并重新点击用户态 OAuth 才会生效；飞书开放平台也必须先开通对应权限。" },
  showProgress: { title: "向用户展示工作过程", body: "开启后向用户展示工具调用、检索和重试等可观察进度，不展示模型隐藏推理或敏感参数。" },
  skillAccess: { title: "允许访问的 Skills", body: "Bot 只能看到明确勾选的 Skills。新增或导入的 Skill 默认不授权，避免能力范围意外扩大。" }
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

function dateTimeLocalValue(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function loadScheduledTasksForSelectedBot(): Promise<void> {
  const bot = snapshot.config.bots.find((item) => item.id === selectedAutomationBotId) ?? snapshot.config.bots[0];
  if (!bot) {
    scheduledTasks = [];
    return;
  }
  selectedAutomationBotId = bot.id;
  scheduledTasks = await window.quarkfanTools.scheduledTasks(bot.id);
}

function collectScheduledTasks(): ScheduledTask[] {
  return [...document.querySelectorAll<HTMLElement>("[data-scheduled-task]")].map((row) => {
    const original = scheduledTasks.find((task) => task.id === row.dataset.scheduledTask)!;
    const field = (name: string) => row.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-scheduled-field="${name}"]`);
    const enabled = row.querySelector<HTMLInputElement>('[data-scheduled-field="enabled"]')?.checked ?? false;
    const runAtValue = field("trigger.runAt")?.value;
    return {
      ...original,
      enabled,
      name: field("name")?.value || original.name,
      trigger: {
        ...original.trigger,
        type: field("trigger.type")?.value === "once" ? "once" : "interval",
        intervalMinutes: Math.max(1, Math.min(10080, Number(field("trigger.intervalMinutes")?.value ?? 60) || 60)),
        runAt: runAtValue ? new Date(runAtValue).toISOString() : undefined
      },
      target: {
        type: "prompt",
        prompt: field("target.prompt")?.value ?? ""
      },
      output: {
        mode: "none"
      },
      policy: {
        timeoutSeconds: Math.max(30, Math.min(86400, Number(field("policy.timeoutSeconds")?.value ?? 1800) || 1800)),
        missed: field("policy.missed")?.value === "run-once" ? "run-once" : "skip",
        concurrency: field("policy.concurrency")?.value === "queue" ? "queue" : "skip-if-running"
      }
    };
  });
}

function configured(config: AppConfig): boolean {
  return Boolean(
    config.model.baseUrl &&
    config.model.model &&
    config.model.apiKey &&
    config.bots.some((bot) => bot.enabled && bot.appId && bot.appSecret)
  );
}

function botCanStart(bot: BotConfig): boolean {
  return Boolean(
    bot.enabled &&
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

function botRuntimeStatus(bot: BotConfig): string {
  if (snapshot.connectedBotIds.includes(bot.id)) return "监听已连接";
  if (snapshot.runningBotIds.includes(bot.id)) return "worker 启动中";
  return bot.enabled ? "未启动" : "已停用";
}

function helpButton(topic: string): string {
  return `<button type="button" class="help-button" data-help="${escapeHtml(topic)}" aria-label="查看配置说明">?</button>`;
}

function render(): void {
  const isConfigured = configured(snapshot.config);
  const enabledBotCount = snapshot.config.bots.filter((bot) => bot.enabled).length;
  const onlineBotCount = snapshot.connectedBotIds.length;
  const botStatus = enabledBotCount > 0 ? `BOTS ${onlineBotCount}/${enabledBotCount} ONLINE` : "NO BOT ENABLED";
  app.innerHTML = `
    <div class="window-drag-strip" title="拖动窗口"><span>QUARKFANTOOLS</span></div>
    <aside class="rail">
      <button type="button" class="brand brand-button" id="show-manual" title="打开使用手册">QUARK<span>FAN</span>TOOLS</button>
      <div class="rail-label">LOCAL SKILL AGENT</div>
      <nav>
        <button class="${activeView === "console" ? "active" : ""}" data-view="console">运行台</button>
        <button class="${activeView === "skills" ? "active" : ""}" data-view="skills">技能市场</button>
        <button class="${activeView === "automation" ? "active" : ""}" data-view="automation">自动化</button>
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
          <h1>${activeView === "console" ? "运行控制台" : activeView === "skills" ? "本地技能市场" : activeView === "automation" ? "自动化任务" : activeView === "config" ? "机器人与模型配置" : "会话存储管理"}</h1>
        </div>
        <div class="actions">
          ${activeView === "skills" ? `<button class="ghost" id="import-skill">导入 Skill</button>` : ""}
        </div>
      </header>
      ${!isConfigured ? `<div class="notice">至少配置一个启用的飞书机器人，并填写 Claude 兼容模型连接信息。</div>` : ""}
      ${activeView === "console" ? renderConsole() : activeView === "skills" ? renderSkills() : activeView === "automation" ? renderAutomation() : activeView === "config" ? renderConfig() : renderStorage()}
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
            <span class="source-badge ${skill.source}">${skillSourceLabel(skill.source)}</span>
            ${skill.source === "local" ? `<button class="danger remove-local-skill" data-name="${escapeHtml(skill.name)}" ${inUseBy ? "disabled" : ""} title="${inUseBy ? `正在被 ${escapeHtml(inUseBy)} 使用，先取消 Bot 授权后才能删除` : "删除本地 Skill"}">删除</button>` : ""}
          </article>`;
        }).join("") || `<div class="empty">当前没有可用 Skill。</div>`}
      </div>
    </section>
  `;
}

function renderPreview(): string {
  return `<div class="modal-backdrop" id="preview-backdrop"><section class="release-modal preview-modal" role="dialog" aria-modal="true">
    <div class="release-modal-header"><h2>${escapeHtml(preview?.title)}</h2><button class="ghost" id="close-preview">关闭</button></div>
    <pre class="preview-content">${escapeHtml(preview?.body)}</pre>
  </section></div>`;
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
              <li>在 Bot 列表中新增机器人，填写飞书 App ID 和 App Secret。</li>
              <li>按需点击“用户态 OAuth”，完成文档搜索、导出和读取所需的用户授权。</li>
              <li>给 Bot 勾选允许访问的 Skills，保存后到“运行台”启动监听。</li>
            </ol>
          </section>
          <section>
            <h3>模型配置</h3>
            <p><strong>Provider 名称</strong>只用于界面展示。<strong>Claude Base URL</strong> 必须兼容 Claude Messages API 和工具调用。<strong>模型</strong>要填写服务商提供的模型名。<strong>API Key</strong>只保存在本机。</p>
            <p><strong>最大并发任务数</strong>控制不同会话同时运行的 Agent 数量；同一会话仍串行。<strong>单次 Agent 最大步数</strong>用于复杂检索，默认 60。<strong>多模态视觉能力</strong>影响图片和 PPT 视觉预览是否传给模型。</p>
          </section>
          <section>
            <h3>机器人配置</h3>
            <p>配置页中的 Bot 以列表展示，点击行打开编辑弹窗。每个 Bot 拥有独立飞书 CLI 状态、Claude home、会话 workspace 和 Skill 授权。</p>
            <p><strong>App ID / App Secret</strong>来自飞书开放平台。<strong>接收身份</strong>控制事件监听身份，通常用 Bot。<strong>回复身份</strong>控制消息、表情和文件回复身份，通常也用 Bot。</p>
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
            <h3>运行台</h3>
            <p>运行台显示在线 Bot、可用 Skills、运行中任务和排队任务。点击 Bot 可查看该 Bot 的独立日志，并按日志等级筛选。</p>
            <p>收到飞书消息后，应用会先给原消息添加处理中表情，处理完成后移除并回复结果。多人同时提问时，超出并发上限的任务会排队。</p>
            <p>如果某个群成员 @ 飞书机器人后只看到平台提示“需要机器人主人的允许”，且运行台没有“收到飞书消息”，说明消息未到达 QuarkfanTools，本地监听和模型不会参与处理。请检查飞书应用是否已发布，且可用范围包含该群成员或所在组织。</p>
          </section>
          <section>
            <h3>飞书资料与文件</h3>
            <p>搜索、读取飞书文档、Wiki、云盘和云 PPT 使用用户态授权。云 PPT 属于 slides 文档，需要导出为 PPTX 后再预览或分析。</p>
            <p>如果日志或回复提示缺少 scope，把缺少的权限加入 Bot 的“用户态 OAuth 额外权限”，保存后重新授权；同时确认飞书开放平台已经给应用开通该权限。</p>
          </section>
          <section>
            <h3>存储管理</h3>
            <p>存储管理用于查看和清理连续会话 workspace、Claude 会话记录和消息附件。点击会话可查看 Claude session、关联消息和文件清单。</p>
            <p>清理会话不会删除应用配置、飞书授权、Skill 市场配置或用户导入 Skills。</p>
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

function renderStorage(): string {
  return `
    <section class="metrics">
      <article><span>会话存储占用</span><strong>${formatBytes(storage.totalBytes)}</strong></article>
      <article><span>连续会话</span><strong>${storage.sessionCount}</strong></article>
      <article><span>已过期会话</span><strong>${storage.expiredSessionCount}</strong></article>
      <article><span>机器人目录</span><strong>${storage.botCount}</strong></article>
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
      <div class="panel storage-card danger-zone">
        <div class="panel-title"><span>ALL SESSION DATA</span><small>不可恢复</small></div>
        <p>清理全部会话上下文、workspace 和已下载消息附件。机器人配置、飞书授权与用户 Skills 会保留。</p>
        <button class="danger" id="clear-all-storage">清理全部会话数据</button>
      </div>
    </section>
  `;
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
      <article><span>可用 Skills</span><strong>${snapshot.skills.length}</strong></article>
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
                <p>${bot.skillNames.length} 个授权 Skill / ${botRuntimeStatus(bot)}</p>
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
            <button class="ghost compact" id="copy-diagnostic-log">${logCopyState ? escapeHtml(logCopyState) : "复制日志"}</button>
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

function renderAutomation(): string {
  const selectedBot = snapshot.config.bots.find((bot) => bot.id === selectedAutomationBotId) ?? snapshot.config.bots[0];
  if (selectedBot && selectedAutomationBotId !== selectedBot.id) selectedAutomationBotId = selectedBot.id;
  return `
    <section class="metrics">
      <article><span>当前 Bot</span><strong>${escapeHtml(selectedBot?.name ?? "未配置")}</strong></article>
      <article><span>定时任务</span><strong>${scheduledTasks.length}</strong></article>
      <article><span>已启用</span><strong>${scheduledTasks.filter((task) => task.enabled).length}</strong></article>
      <article><span>运行中任务</span><strong>${snapshot.activeTasks}</strong></article>
    </section>
    <section class="workspace">
      <div class="panel skill-panel">
        <div class="panel-title"><span>BOT</span><small>scheduled tasks</small></div>
        <div class="skill-list bot-registry">
          ${snapshot.config.bots.map((bot) => `
            <div class="skill bot-runtime-card ${selectedBot?.id === bot.id ? "selected" : ""}" data-select-automation-bot="${escapeHtml(bot.id)}">
              <div class="skill-glyph">${escapeHtml(bot.name.slice(0, 2).toUpperCase())}</div>
              <div class="bot-runtime-main">
                <strong>${statusDot(snapshot.connectedBotIds.includes(bot.id))}${escapeHtml(bot.name)}</strong>
                <p>${botRuntimeStatus(bot)} / ${bot.skillNames.length} 个授权 Skill</p>
              </div>
            </div>`).join("") || `<div class="empty">请先添加机器人。</div>`}
        </div>
      </div>
      <div class="panel log-panel">
        <div class="panel-title log-title">
          <span>${selectedBot ? `${escapeHtml(selectedBot.name)} / SCHEDULED TASKS` : "SCHEDULED TASKS"}</span>
          <div class="log-controls">
            <button class="ghost compact" id="add-scheduled-task" ${selectedBot ? "" : "disabled"}>新增任务</button>
            <button class="primary compact" id="save-scheduled-tasks" ${selectedBot ? "" : "disabled"}>保存任务</button>
          </div>
        </div>
        <div class="scheduled-task-list">
          ${scheduledTasks.map((task) => renderScheduledTask(task, Boolean(selectedBot && snapshot.runningBotIds.includes(selectedBot.id)))).join("") || `<div class="empty">当前 Bot 还没有定时任务。</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderScheduledTask(task: ScheduledTask, botRunning: boolean): string {
  const next = task.state.nextRunAt ? new Date(task.state.nextRunAt).toLocaleString() : "未计划";
  const last = task.state.lastRunAt ? `${new Date(task.state.lastRunAt).toLocaleString()} / ${task.state.lastStatus ?? "unknown"}` : "未运行";
  return `
    <article class="storage-row scheduled-task-row" data-scheduled-task="${escapeHtml(task.id)}">
      <label class="check"><input type="checkbox" data-scheduled-field="enabled" ${task.enabled ? "checked" : ""}/><span><strong>${escapeHtml(task.name)}</strong><small>下次：${escapeHtml(next)} / 上次：${escapeHtml(last)}</small></span></label>
      <div class="field-row">
        <label><span>名称</span><input data-scheduled-field="name" value="${escapeHtml(task.name)}" /></label>
        <label><span>触发方式</span><select data-scheduled-field="trigger.type"><option value="interval" ${task.trigger.type === "interval" ? "selected" : ""}>间隔</option><option value="once" ${task.trigger.type === "once" ? "selected" : ""}>一次性</option></select></label>
      </div>
      <div class="field-row">
        <label><span>间隔分钟</span><input data-scheduled-field="trigger.intervalMinutes" type="number" min="1" max="10080" value="${task.trigger.intervalMinutes ?? 60}" /></label>
        <label><span>一次性运行时间</span><input data-scheduled-field="trigger.runAt" type="datetime-local" value="${dateTimeLocalValue(task.trigger.runAt)}" /></label>
      </div>
      <label><span>任务提示词</span><textarea data-scheduled-field="target.prompt" rows="4">${escapeHtml(task.target.prompt)}</textarea><small>首版仅支持 prompt 类型，结果写入运行台日志，不主动发送飞书消息。</small></label>
      <div class="field-row">
        <label><span>超时秒数</span><input data-scheduled-field="policy.timeoutSeconds" type="number" min="30" max="86400" value="${task.policy.timeoutSeconds}" /></label>
        <label><span>错过策略</span><select data-scheduled-field="policy.missed"><option value="skip" ${task.policy.missed === "skip" ? "selected" : ""}>跳过</option><option value="run-once" ${task.policy.missed === "run-once" ? "selected" : ""}>补跑一次</option></select></label>
        <label><span>并发策略</span><select data-scheduled-field="policy.concurrency"><option value="skip-if-running" ${task.policy.concurrency === "skip-if-running" ? "selected" : ""}>运行中则跳过</option><option value="queue" ${task.policy.concurrency === "queue" ? "selected" : ""}>排队</option></select></label>
      </div>
      ${task.state.lastError ? `<pre>${escapeHtml(task.state.lastError)}</pre>` : ""}
      <div class="form-actions">
        <button type="button" class="ghost run-scheduled-task" data-id="${escapeHtml(task.id)}" ${botRunning ? "" : "disabled"}>立即运行</button>
        <button type="button" class="danger remove-scheduled-task" data-id="${escapeHtml(task.id)}">删除</button>
      </div>
    </article>
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
      ${botField(bot, "App ID", "appId")}
      ${botField(bot, "App Secret", "appSecret", "password")}
      <div class="field-row">
        <label><span>接收身份${helpButton("receiveIdentity")}</span><select data-edit-bot-field="receiveIdentity"><option value="bot" ${bot.receiveIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.receiveIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
        <label><span>回复身份${helpButton("replyIdentity")}</span><select data-edit-bot-field="replyIdentity"><option value="bot" ${bot.replyIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.replyIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
      </div>
      ${botField(bot, "处理中表情", "pendingReaction")}
      ${botField(bot, "Owner 飞书 open_id", "ownerOpenId")}
      ${botTextarea(bot, "用户态 OAuth 额外权限", "oauthScopes", "默认会申请 search:docs:read；这里可填写额外 scope，支持空格、逗号或换行分隔，例如 drive:export:readonly、docs:document:export。修改后需重新点击用户态 OAuth。")}
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
      <div class="form-actions bot-editor-actions">
        <button type="button" class="ghost oauth-bot" data-id="${bot.id}">用户态 OAuth</button>
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
          <label><span>Bot 运行隔离${helpButton("botIsolationMode")}</span><select name="botIsolationMode"><option value="process" ${(c.runtime.botIsolationMode ?? "process") === "process" ? "selected" : ""}>进程隔离，推荐</option><option value="auto" ${c.runtime.botIsolationMode === "auto" ? "selected" : ""}>自动选择，预留 Docker</option><option value="container" ${c.runtime.botIsolationMode === "container" ? "selected" : ""}>容器隔离，需要 Docker</option></select><small>当前版本默认使用内置 worker 进程；Docker 状态会进入诊断日志，容器执行后续接入。</small></label>
          <label><span>防休眠${helpButton("preventSleepMode")}</span><select name="preventSleepMode"><option value="off" ${(c.runtime.preventSleepMode ?? "off") === "off" ? "selected" : ""}>关闭</option><option value="when-running" ${c.runtime.preventSleepMode === "when-running" ? "selected" : ""}>Bot 监听时阻止休眠</option><option value="when-busy" ${c.runtime.preventSleepMode === "when-busy" ? "selected" : ""}>任务执行时阻止休眠</option></select><small>用于 7x24 部署；不能阻止用户手动合盖或关机。</small></label>
          <label><span>多模态视觉能力${helpButton("multimodalEnabled")}</span><select name="multimodalEnabled"><option value="true" ${c.model.multimodalEnabled ? "selected" : ""}>启用，允许图片与 PPT 视觉解析</option><option value="false" ${!c.model.multimodalEnabled ? "selected" : ""}>禁用，仅文本模型</option></select><small>PPT Skill 要求启用此能力，否则会拒绝仅凭抽取文字完成解析。</small></label>
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
          <div class="panel-title"><span>BOT REGISTRY ${helpButton("botList")}</span><small>${c.bots.length} configured</small></div>
          <div class="config-bot-list">
            ${c.bots.map((bot) => `
              <button type="button" class="config-bot-row" data-edit-bot="${escapeHtml(bot.id)}">
                <span>${statusDot(bot.enabled)}<strong>${escapeHtml(bot.name || "未命名机器人")}</strong></span>
                <small>${escapeHtml(bot.appId || "未配置 App ID")} / ${bot.skillNames.length} Skills / ${bot.oauthScopes?.length ?? 0} extra scopes</small>
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
    cliPath: "",
    profile: "",
    appId: "",
    appSecret: "",
    receiveIdentity: "bot",
    replyIdentity: "bot",
    eventTypes: ["im.message.receive_v1"],
    oauthScopes: [],
    skillNames: [],
    pendingReaction: "OnIt",
    ownerOpenId: "",
    showProgress: false
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
      if (activeView === "automation") await loadScheduledTasksForSelectedBot();
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#import-skill")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.importSkill();
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
  document.querySelectorAll<HTMLElement>("[data-select-automation-bot]").forEach((card) => {
    card.onclick = async () => {
      selectedAutomationBotId = String(card.dataset.selectAutomationBot);
      await loadScheduledTasksForSelectedBot();
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#add-scheduled-task")?.addEventListener("click", async () => {
    if (!selectedAutomationBotId) return;
    scheduledTasks = await window.quarkfanTools.newScheduledTask(selectedAutomationBotId);
    render();
  });
  document.querySelector<HTMLButtonElement>("#save-scheduled-tasks")?.addEventListener("click", async () => {
    if (!selectedAutomationBotId) return;
    scheduledTasks = await window.quarkfanTools.saveScheduledTasks(selectedAutomationBotId, collectScheduledTasks());
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-scheduled-task").forEach((button) => {
    button.onclick = async () => {
      if (!selectedAutomationBotId) return;
      scheduledTasks = await window.quarkfanTools.saveScheduledTasks(
        selectedAutomationBotId,
        collectScheduledTasks().filter((task) => task.id !== button.dataset.id)
      );
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".run-scheduled-task").forEach((button) => {
    button.onclick = async () => {
      if (!selectedAutomationBotId) return;
      scheduledTasks = await window.quarkfanTools.saveScheduledTasks(selectedAutomationBotId, collectScheduledTasks());
      scheduledTasks = await window.quarkfanTools.runScheduledTaskNow(selectedAutomationBotId, String(button.dataset.id));
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".bot-start").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      selectedBotId = String(button.dataset.id);
      const bot = snapshot.config.bots.find((item) => item.id === selectedBotId);
      appendLocalLog("info", "正在启动机器人监听", bot?.name ?? selectedBotId, selectedBotId);
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
  document.querySelector<HTMLSelectElement>("#log-level")?.addEventListener("change", (event) => {
    logLevel = (event.currentTarget as HTMLSelectElement).value as typeof logLevel;
    render();
  });
  document.querySelector<HTMLButtonElement>("#copy-diagnostic-log")?.addEventListener("click", async () => {
    try {
      const text = await window.quarkfanTools.diagnosticLog();
      await navigator.clipboard.writeText(text);
      logCopyState = "已复制";
    } catch (error) {
      logCopyState = "复制失败";
      console.error(error);
    }
    render();
    window.setTimeout(() => {
      logCopyState = "";
      render();
    }, 1600);
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
      const transcript = value.transcript.length > 0
        ? value.transcript.map((turn, index) => [
            `#${index + 1} ${new Date(turn.time).toLocaleString()} / ${turn.messageId}`,
            `用户：${turn.user}`,
            `机器人：${turn.assistant}`
          ].join("\n")).join("\n\n")
        : `暂无可回放对话记录。旧版本会话只保存消息 ID：${value.messageIds.join(", ") || "无"}`;
      preview = { title: `会话 ${value.conversationKey}`, body: `Bot: ${value.botId}\nClaude session: ${value.sessionId}\n更新时间: ${value.updatedAt}\n\nCONVERSATION\n${transcript}\n\nFILES\n${value.files.map((file) => `${formatBytes(file.bytes)}  ${file.path}`).join("\n") || "无"}` };
      render();
    };
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
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-selected")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll<HTMLInputElement>("[data-session-id]:checked")].map((input) => String(input.dataset.sessionId));
    if (ids.length === 0) return;
    storage = await window.quarkfanTools.clearSelectedStorage(ids);
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
    render();
  });
  document.querySelector<HTMLButtonElement>("#clear-all-storage")?.addEventListener("click", async () => {
    if (!window.confirm("确认清理全部会话上下文、workspace 和消息附件？此操作不可恢复。")) return;
    storage = await window.quarkfanTools.clearAllSessionStorage();
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
  document.querySelector<HTMLFormElement>("#bot-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = structuredClone(snapshot.config);
    const bot = next.bots.find((item) => item.id === editingBotId);
    if (!bot) return;
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-edit-bot-field]").forEach((input) => {
      const fieldName = input.dataset.editBotField as keyof BotConfig;
      (bot as unknown as Record<string, unknown>)[fieldName] = fieldName === "oauthScopes"
        ? parseScopes(input.value)
        : ["enabled", "showProgress"].includes(fieldName) ? input.value === "true" : input.value;
    });
    bot.skillNames = [...document.querySelectorAll<HTMLInputElement>(`[data-edit-bot-skill="${editingBotId}"]:checked`)].map((input) => input.value);
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
    next.runtime.maxConcurrentTasks = Math.max(1, Math.min(20, Number(form.get("maxConcurrentTasks") ?? 2) || 2));
    next.runtime.maxAgentTurns = Math.max(10, Math.min(100, Number(form.get("maxAgentTurns") ?? 60) || 60));
    const isolationMode = String(form.get("botIsolationMode") ?? "process");
    next.runtime.botIsolationMode = isolationMode === "auto" || isolationMode === "container" ? isolationMode : "process";
    const preventSleepMode = String(form.get("preventSleepMode") ?? "off");
    next.runtime.preventSleepMode = preventSleepMode === "when-running" || preventSleepMode === "when-busy" ? preventSleepMode : "off";
    next.skillMarket.enabled = String(form.get("marketEnabled") ?? "false") === "true";
    next.skillMarket.repositoryUrl = String(form.get("marketRepositoryUrl") ?? "");
    next.skillMarket.branch = String(form.get("marketBranch") ?? "main");
    next.skillMarket.token = String(form.get("marketToken") ?? "");
    snapshot = await window.quarkfanTools.saveConfig(next);
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
  [snapshot, logs, storage, applicationInfo] = await Promise.all([
    window.quarkfanTools.snapshot(),
    window.quarkfanTools.logs(),
    window.quarkfanTools.storageStats(),
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
  if (snapshot.config.bots[0]) selectedBotId = snapshot.config.bots[0].id;
  render();
}

void bootstrap();
