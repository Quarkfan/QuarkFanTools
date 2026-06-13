import "./style.css";
import type { AppConfig, LogEntry, RuntimeSnapshot } from "../electron/types";

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
  return Boolean(config.lark.appId && config.lark.appSecret && config.model.model && config.model.apiKey);
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
          <h1>${activeView === "console" ? "运行控制台" : "连接与模型配置"}</h1>
        </div>
        <div class="actions">
          <button class="ghost" id="open-skills">打开 Skills</button>
          ${snapshot.running
            ? `<button class="danger" id="stop">停止监听</button>`
            : `<button class="primary" id="start" ${isConfigured ? "" : "disabled"}>启动监听</button>`}
        </div>
      </header>
      ${!isConfigured ? `<div class="notice">首次运行需要填写飞书 App ID / Secret 和模型连接信息。保存后即可启动。</div>` : ""}
      ${activeView === "console" ? renderConsole() : renderConfig()}
    </main>
  `;
  bindEvents();
}

function renderConsole(): string {
  return `
    <section class="metrics">
      <article><span>飞书连接</span><strong>${statusDot(snapshot.larkConnected)}${snapshot.larkConnected ? "在线" : "离线"}</strong></article>
      <article><span>可用 Skills</span><strong>${snapshot.skills.length}</strong></article>
      <article><span>运行中任务</span><strong>${snapshot.activeTasks}</strong></article>
      <article><span>接收身份</span><strong>${escapeHtml(snapshot.config.lark.receiveIdentity).toUpperCase()}</strong></article>
    </section>
    <section class="workspace">
      <div class="panel skill-panel">
        <div class="panel-title"><span>SKILL REGISTRY</span><small>${snapshot.skills.length} loaded</small></div>
        <div class="skill-list">
          ${snapshot.skills.map((skill) => `
            <div class="skill">
              <div class="skill-glyph">${escapeHtml(skill.name.slice(0, 2).toUpperCase())}</div>
              <div><strong>${escapeHtml(skill.name)}</strong><p>${escapeHtml(skill.description || "No description")}</p></div>
            </div>`).join("") || `<div class="empty">将 Skill 文件夹放入 skills/ 后重启应用。</div>`}
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

function renderConfig(): string {
  const c = snapshot.config;
  return `
    <form id="config-form">
      <section class="config-grid">
        <div class="panel config-panel">
          <div class="panel-title"><span>FEISHU CONNECTION</span><small>内置 lark-cli</small></div>
          ${field("App ID", "appId", c.lark.appId, "text", "飞书开放平台应用 App ID")}
          ${field("App Secret", "appSecret", c.lark.appSecret, "password", "仅保存在本机配置目录")}
          <div class="field-row">
            <label><span>接收身份</span><select name="receiveIdentity"><option value="bot" ${c.lark.receiveIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${c.lark.receiveIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
            <label><span>回复身份</span><select name="replyIdentity"><option value="bot" ${c.lark.replyIdentity === "bot" ? "selected" : ""}>Bot</option><option value="user" ${c.lark.replyIdentity === "user" ? "selected" : ""}>用户态</option></select></label>
          </div>
        </div>
        <div class="panel config-panel">
          <div class="panel-title"><span>MODEL PROVIDER</span><small>Claude Messages API compatible</small></div>
          ${field("Provider 名称", "providerName", c.model.providerName)}
          ${field("Claude Base URL", "baseUrl", c.model.baseUrl, "url", "服务商提供的 Claude / Anthropic 兼容地址")}
          ${field("模型", "model", c.model.model)}
          ${field("API Key", "apiKey", c.model.apiKey, "password", "第三方模型必须兼容 Claude Messages API 与工具调用")}
        </div>
      </section>
      <div class="form-actions"><button type="submit" class="primary">保存配置</button></div>
      <div class="form-actions"><button type="button" class="ghost" id="login-user">飞书用户态 OAuth 登录</button></div>
    </form>
  `;
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.onclick = () => {
      activeView = button.dataset.view as typeof activeView;
      render();
    };
  });
  document.querySelector<HTMLButtonElement>("#open-skills")!.onclick = () => void window.quarkfanTools.openSkills();
  document.querySelector<HTMLButtonElement>("#start")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.start();
    render();
  });
  document.querySelector<HTMLButtonElement>("#stop")?.addEventListener("click", async () => {
    snapshot = await window.quarkfanTools.stop();
    render();
  });
  document.querySelector<HTMLFormElement>("#config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: AppConfig = structuredClone(snapshot.config);
    next.lark.appId = String(data.get("appId") ?? "");
    next.lark.appSecret = String(data.get("appSecret") ?? "");
    next.lark.receiveIdentity = String(data.get("receiveIdentity")) as "user" | "bot";
    next.lark.replyIdentity = String(data.get("replyIdentity")) as "user" | "bot";
    next.model.providerName = String(data.get("providerName") ?? "");
    next.model.baseUrl = String(data.get("baseUrl") ?? "");
    next.model.model = String(data.get("model") ?? "");
    next.model.apiKey = String(data.get("apiKey") ?? "");
    next.model.providerId = "anthropic";
    next.model.apiKeyEnv = "ANTHROPIC_AUTH_TOKEN";
    snapshot = await window.quarkfanTools.saveConfig(next);
    activeView = "console";
    render();
  });
  document.querySelector<HTMLButtonElement>("#login-user")?.addEventListener("click", async () => {
    await window.quarkfanTools.loginLarkUser();
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
