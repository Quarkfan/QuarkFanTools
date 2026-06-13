import "./style.css";
import type { AppConfig, BotConfig, LogEntry, RuntimeSnapshot } from "../electron/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let snapshot: RuntimeSnapshot;
let logs: LogEntry[] = [];
let activeView: "console" | "config" = "console";

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

function statusDot(ok: boolean): string {
  return `<span class="status-dot ${ok ? "ok" : ""}"></span>`;
}

function render(): void {
  const isConfigured = configured(snapshot.config);
  app.innerHTML = `
    <aside class="rail">
      <div class="brand">QUARK<span>FAN</span>TOOLS</div>
      <div class="rail-label">LOCAL SKILL AGENT</div>
      <nav>
        <button class="${activeView === "console" ? "active" : ""}" data-view="console">运行台</button>
        <button class="${activeView === "config" ? "active" : ""}" data-view="config">配置</button>
      </nav>
      <div class="rail-foot">
        <div>${statusDot(snapshot.running)}${snapshot.running ? "RUNNING" : "STOPPED"}</div>
        <small>Claude Agent runtime embedded</small>
      </div>
    </aside>
    <main>
      <header>
        <div>
          <p class="eyebrow">MACOS / FEISHU / CLAUDE</p>
          <h1>${activeView === "console" ? "运行控制台" : "机器人与模型配置"}</h1>
        </div>
        <div class="actions">
          <button class="ghost" id="import-skill">导入 Skill 文件夹</button>
          ${snapshot.running
            ? `<button class="danger" id="stop">停止监听</button>`
            : `<button class="primary" id="start" ${isConfigured ? "" : "disabled"}>启动监听</button>`}
        </div>
      </header>
      ${!isConfigured ? `<div class="notice">至少配置一个启用的飞书机器人，并填写 Claude 兼容模型连接信息。</div>` : ""}
      ${activeView === "console" ? renderConsole() : renderConfig()}
    </main>
  `;
  bindEvents();
}

function renderConsole(): string {
  return `
    <section class="metrics">
      <article><span>在线机器人</span><strong>${statusDot(snapshot.connectedBotIds.length > 0)}${snapshot.connectedBotIds.length}/${snapshot.config.bots.filter((bot) => bot.enabled).length}</strong></article>
      <article><span>可用 Skills</span><strong>${snapshot.skills.length}</strong></article>
      <article><span>运行中任务</span><strong>${snapshot.activeTasks}</strong></article>
      <article><span>模型</span><strong>${escapeHtml(snapshot.config.model.model || "未配置")}</strong></article>
    </section>
    <section class="workspace">
      <div class="panel skill-panel">
        <div class="panel-title"><span>BOT REGISTRY</span><small>${snapshot.config.bots.length} configured</small></div>
        <div class="skill-list">
          ${snapshot.config.bots.map((bot) => `
            <div class="skill">
              <div class="skill-glyph">${escapeHtml(bot.name.slice(0, 2).toUpperCase())}</div>
              <div><strong>${statusDot(snapshot.connectedBotIds.includes(bot.id))}${escapeHtml(bot.name)}</strong><p>${bot.skillNames.length} 个授权 Skill / ${bot.enabled ? "启用" : "停用"}</p></div>
            </div>`).join("") || `<div class="empty">前往配置页添加机器人。</div>`}
        </div>
      </div>
      <div class="panel log-panel">
        <div class="panel-title"><span>LIVE EXECUTION LOG</span><small>${logs.length} events</small></div>
        <div class="logs">
          ${logs.slice().reverse().map((entry) => `
            <div class="log ${entry.level}">
              <time>${new Date(entry.time).toLocaleTimeString()}</time>
              <div><strong>${escapeHtml(entry.message)}</strong>${entry.detail ? `<pre>${escapeHtml(entry.detail)}</pre>` : ""}</div>
            </div>`).join("") || `<div class="empty">启动监听后，飞书消息与 Agent 执行过程会显示在这里。</div>`}
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
      <div class="skill-access">
        <span>允许访问的 Skills</span>
        ${snapshot.skills.map((skill) => `<label class="check"><input type="checkbox" data-bot-skill="${bot.id}" value="${escapeHtml(skill.name)}" ${bot.skillNames.includes("*") || bot.skillNames.includes(skill.name) ? "checked" : ""}/>${escapeHtml(skill.name)}</label>`).join("") || `<small>请先导入 Skill 文件夹</small>`}
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
    pendingReaction: "OnIt"
  };
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.onclick = () => {
      activeView = button.dataset.view as typeof activeView;
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#import-skill")!.onclick = async () => {
    snapshot = await window.quarkfanTools.importSkill();
    render();
  };
  document.querySelector<HTMLButtonElement>("#start")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.start();
    render();
  });
  document.querySelector<HTMLButtonElement>("#stop")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.stop();
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

async function bootstrap(): Promise<void> {
  [snapshot, logs] = await Promise.all([window.quarkfanTools.snapshot(), window.quarkfanTools.logs()]);
  window.quarkfanTools.onSnapshot((value) => {
    snapshot = value;
    render();
  });
  window.quarkfanTools.onLog((entry) => {
    logs.push(entry);
    render();
  });
  render();
}

void bootstrap();
