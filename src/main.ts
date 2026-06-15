import "./style.css";
import type { AppConfig, AppInfo, BotConfig, LogEntry, RuntimeSnapshot, StorageStats } from "../electron/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: RuntimeSnapshot;
let logs: LogEntry[] = [];
let storage: StorageStats;
let applicationInfo: AppInfo;
let activeView: "console" | "skills" | "config" | "storage" = "console";
let selectedBotId = "";
let logLevel: "all" | LogEntry["level"] = "all";
let showReleaseNotes = false;
let marketSource = "all";

function closeReleaseNotes(): void {
  showReleaseNotes = false;
  render();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function render(): void {
  const isConfigured = configured(snapshot.config);
  app.innerHTML = `
    <div class="window-drag-strip" title="拖动窗口"><span>QUARKFANTOOLS</span></div>
    <aside class="rail">
      <div class="brand">QUARK<span>FAN</span>TOOLS</div>
      <div class="rail-label">LOCAL SKILL AGENT</div>
      <nav>
        <button class="${activeView === "console" ? "active" : ""}" data-view="console">运行台</button>
        <button class="${activeView === "skills" ? "active" : ""}" data-view="skills">技能市场</button>
        <button class="${activeView === "config" ? "active" : ""}" data-view="config">配置</button>
        <button class="${activeView === "storage" ? "active" : ""}" data-view="storage">存储管理</button>
      </nav>
      <div class="rail-foot">
        <div>${statusDot(snapshot.running)}${snapshot.running ? "RUNNING" : "STOPPED"}</div>
        <small>Claude Agent runtime embedded</small>
        <button class="version-button" id="show-release-notes">VERSION ${escapeHtml(applicationInfo.version)}</button>
      </div>
    </aside>
    <main>
      <header>
        <div>
          <p class="eyebrow">MACOS / FEISHU / CLAUDE</p>
          <h1>${activeView === "console" ? "运行控制台" : activeView === "skills" ? "本地技能市场" : activeView === "config" ? "机器人与模型配置" : "会话存储管理"}</h1>
        </div>
        <div class="actions">
          ${activeView === "skills" ? `<button class="ghost" id="import-skill">导入 Skill</button>` : ""}
        </div>
      </header>
      ${!isConfigured ? `<div class="notice">至少配置一个启用的飞书机器人，并填写 Claude 兼容模型连接信息。</div>` : ""}
      ${activeView === "console" ? renderConsole() : activeView === "skills" ? renderSkills() : activeView === "config" ? renderConfig() : renderStorage()}
    </main>
    ${showReleaseNotes ? renderReleaseNotes() : ""}
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
        <input id="market-search" type="search" placeholder="搜索 Skill 名称或描述" />
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
        ${snapshot.skills.map((skill) => `
          <article class="market-skill-row" data-market-search="${escapeHtml(`${skill.name} ${skill.description}`.toLowerCase())}" data-market-source="${skill.source}" data-market-unused="${snapshot.config.bots.some((bot) => bot.skillNames.includes(skill.name)) ? "false" : "true"}">
            <div class="skill-glyph">${escapeHtml(skill.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(skill.name)}</strong>
              <p>${escapeHtml(skill.description || "未提供描述")}</p>
              <small>${escapeHtml(snapshot.config.bots.filter((bot) => bot.skillNames.includes(skill.name)).map((bot) => bot.name).join("、") || "未授权给任何 Bot")}</small>
            </div>
            <span class="source-badge ${skill.source}">${skillSourceLabel(skill.source)}</span>
            ${skill.source === "local" ? `<button class="danger remove-local-skill" data-name="${escapeHtml(skill.name)}">删除</button>` : ""}
          </article>`).join("") || `<div class="empty">当前没有可用 Skill。</div>`}
      </div>
    </section>
  `;
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
            <label class="check session-row">
              <input type="checkbox" data-session-id="${escapeHtml(session.id)}" />
              <span><strong>${escapeHtml(snapshot.config.bots.find((bot) => bot.id === session.botId)?.name || session.botId)}</strong><small>${escapeHtml(session.conversationKey)} / ${new Date(session.updatedAt).toLocaleString()} / ${formatBytes(session.bytes)}${session.expired ? " / 已过期" : ""}</small></span>
            </label>`).join("") || `<div class="empty">当前没有连续会话存储。</div>`}
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
                <p>${bot.skillNames.length} 个授权 Skill / ${snapshot.runningBotIds.includes(bot.id) ? "监听中" : bot.enabled ? "未启动" : "已停用"}</p>
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

function field(label: string, name: string, value: string, type = "text", note = ""): string {
  return `<label><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" />${note ? `<small>${note}</small>` : ""}</label>`;
}

function botField(bot: BotConfig, label: string, fieldName: keyof BotConfig, type = "text"): string {
  return `<label><span>${label}</span><input data-bot="${bot.id}" data-field="${fieldName}" type="${type}" value="${escapeHtml(bot[fieldName])}" /></label>`;
}

function renderBot(bot: BotConfig): string {
  return `
    <div class="panel config-panel bot-card">
      <div class="panel-title">
        <span>${escapeHtml(bot.name || "未命名机器人")}</span>
        <div><button type="button" class="ghost oauth-bot" data-id="${bot.id}">用户态 OAuth</button><button type="button" class="danger remove-bot" data-id="${bot.id}">删除</button></div>
      </div>
      <div class="field-row">
        ${botField(bot, "机器人名称", "name")}
        <label><span>启用</span><select data-bot="${bot.id}" data-field="enabled"><option value="true" ${bot.enabled ? "selected" : ""}>启用</option><option value="false" ${!bot.enabled ? "selected" : ""}>停用</option></select></label>
      </div>
      ${botField(bot, "App ID", "appId")}
      ${botField(bot, "App Secret", "appSecret", "password")}
      <div class="field-row">
        <label><span>接收身份</span><select data-bot="${bot.id}" data-field="receiveIdentity"><option value="bot" ${bot.receiveIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.receiveIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
        <label><span>回复身份</span><select data-bot="${bot.id}" data-field="replyIdentity"><option value="bot" ${bot.replyIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${bot.replyIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
      </div>
      ${botField(bot, "处理中表情", "pendingReaction")}
      ${botField(bot, "Owner 飞书 open_id", "ownerOpenId")}
      <small class="bot-note">Agent 无法解决或需要人工授权时，会私聊此用户发送卡片。Owner 必须在飞书中有该应用的使用权限。</small>
      <div class="skill-access">
        <div class="skill-access-heading"><span>允许访问的 Skills</span><small>${bot.skillNames.length} / ${snapshot.skills.length} 已授权</small></div>
        <small>新增 Skill 默认不授权。可搜索后批量授权或取消当前筛选结果。</small>
        <div class="skill-access-controls">
          <input type="search" data-skill-filter="${bot.id}" placeholder="搜索名称或描述" />
          <button type="button" class="ghost skill-select-visible" data-id="${bot.id}">授权筛选结果</button>
          <button type="button" class="ghost skill-clear-visible" data-id="${bot.id}">取消筛选结果</button>
        </div>
        <div class="skill-check-list">
          ${snapshot.skills.map((skill) => `<label class="check" data-bot-skill-row="${bot.id}" data-skill-search="${escapeHtml(`${skill.name} ${skill.description}`.toLowerCase())}"><input type="checkbox" data-bot-skill="${bot.id}" value="${escapeHtml(skill.name)}" ${bot.skillNames.includes(skill.name) ? "checked" : ""}/><span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description || skillSourceLabel(skill.source))}</small></span></label>`).join("") || `<small>请先导入 Skill 文件夹</small>`}
        </div>
      </div>
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
          <label><span>最大并发任务数</span><input name="maxConcurrentTasks" type="number" min="1" max="20" value="${c.runtime.maxConcurrentTasks}" /><small>不同会话最多同时运行的 Agent 数量；同一会话仍按顺序处理。</small></label>
          <label><span>多模态视觉能力</span><select name="multimodalEnabled"><option value="true" ${c.model.multimodalEnabled ? "selected" : ""}>启用，允许图片与 PPT 视觉解析</option><option value="false" ${!c.model.multimodalEnabled ? "selected" : ""}>禁用，仅文本模型</option></select><small>PPT Skill 要求启用此能力，否则会拒绝仅凭抽取文字完成解析。</small></label>
        </div>
        <div class="panel config-panel">
          <div class="panel-title"><span>SKILL MARKET</span><small>Built-in Git client / HTTPS</small></div>
          <label><span>启用技能市场</span><select name="marketEnabled"><option value="true" ${c.skillMarket.enabled ? "selected" : ""}>启用</option><option value="false" ${!c.skillMarket.enabled ? "selected" : ""}>停用</option></select></label>
          ${field("HTTPS Git 仓库", "marketRepositoryUrl", c.skillMarket.repositoryUrl, "url", "应用内置 Git 客户端，不依赖本机 Git；仅支持 HTTPS URL")}
          ${field("分支", "marketBranch", c.skillMarket.branch)}
          ${field("访问 Token（可选）", "marketToken", c.skillMarket.token, "password", "私有仓库使用；仅保存在本机配置")}
          <div class="form-actions"><button type="button" class="ghost" id="sync-market" ${c.skillMarket.enabled && c.skillMarket.repositoryUrl ? "" : "disabled"}>立即同步技能市场</button></div>
        </div>
        <div class="panel config-panel">
          <div class="panel-title"><span>BOT ISOLATION</span><small>每个机器人独立凭据、监听和 Skill 权限</small></div>
          <div class="empty">启用的机器人会各自建立独立飞书 CLI 与 Claude 状态目录。未勾选的 Skill 不会暴露给该机器人。</div>
          <div class="form-actions"><button type="button" class="ghost" id="add-bot">新增机器人</button></div>
        </div>
      </section>
      <section class="bot-grid">${c.bots.map(renderBot).join("")}</section>
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
    skillNames: [],
    pendingReaction: "OnIt",
    ownerOpenId: ""
  };
}

function bindEvents(): void {
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
  document.querySelector<HTMLInputElement>("#market-search")?.addEventListener("input", filterMarketSkills);
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
    input.addEventListener("input", () => filterBotSkills(String(input.dataset.skillFilter), input.value));
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
  document.querySelector<HTMLButtonElement>("#add-bot")?.addEventListener("click", () => {
    snapshot.config.bots.push(newBot());
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".remove-bot").forEach((button) => {
    button.onclick = () => {
      snapshot.config.bots = snapshot.config.bots.filter((bot) => bot.id !== button.dataset.id);
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>(".oauth-bot").forEach((button) => {
    button.onclick = () => void window.quarkfanTools.loginLarkUser(String(button.dataset.id));
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
    next.skillMarket.enabled = String(form.get("marketEnabled") ?? "false") === "true";
    next.skillMarket.repositoryUrl = String(form.get("marketRepositoryUrl") ?? "");
    next.skillMarket.branch = String(form.get("marketBranch") ?? "main");
    next.skillMarket.token = String(form.get("marketToken") ?? "");
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-bot][data-field]").forEach((input) => {
      const bot = next.bots.find((item) => item.id === input.dataset.bot);
      if (!bot) return;
      const fieldName = input.dataset.field as keyof BotConfig;
      (bot as unknown as Record<string, unknown>)[fieldName] = fieldName === "enabled" ? input.value === "true" : input.value;
    });
    next.bots.forEach((bot) => {
      bot.skillNames = [...document.querySelectorAll<HTMLInputElement>(`[data-bot-skill="${bot.id}"]:checked`)].map((input) => input.value);
    });
    snapshot = await window.quarkfanTools.saveConfig(next);
    activeView = "console";
    render();
  });
}

function filterBotSkills(botId: string, value: string): void {
  const query = value.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>(`[data-bot-skill-row="${botId}"]`).forEach((row) => {
    row.hidden = !String(row.dataset.skillSearch).includes(query);
  });
}

function filterMarketSkills(): void {
  const query = document.querySelector<HTMLInputElement>("#market-search")?.value.trim().toLowerCase() ?? "";
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
  });
  if (snapshot.config.bots[0]) selectedBotId = snapshot.config.bots[0].id;
  render();
}

void bootstrap();
