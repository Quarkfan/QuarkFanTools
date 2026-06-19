import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { QuarkfanToolsRuntime } from "./runtime.js";
import { saveConfig } from "./config.js";
import { migrateLegacyData, stateRoot } from "./paths.js";
import { loginLarkUser } from "./lark-cli.js";
import { importSkillFolder, removeLocalSkill, skillPreview } from "./skills.js";
import { syncSkillMarket } from "./skill-market.js";
import { clearAllSessionStorage, clearExpiredStorage, clearSelectedSessionStorage, storageSessionDetail, storageStats } from "./storage.js";
import { appInfo } from "./release-notes.js";
import { maskAppId } from "./bot-identity.js";
import type { AppConfig } from "./types.js";

const runtime = new QuarkfanToolsRuntime();
let mainWindow: BrowserWindow | null = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let quittingAfterRuntimeStop = false;

if (!hasSingleInstanceLock) app.quit();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0c100f",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const builtIndex = path.join(import.meta.dirname, "..", "dist", "index.html");
  if (!app.isPackaged) {
    void mainWindow.loadURL("http://localhost:5173").catch(() => mainWindow?.loadFile(builtIndex));
  } else {
    void mainWindow.loadFile(builtIndex);
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    await migrateLegacyData();
    await runtime.initialize();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on("window-all-closed", () => {
  void runtime.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quittingAfterRuntimeStop) return;
  event.preventDefault();
  void runtime.stop().finally(() => {
    quittingAfterRuntimeStop = true;
    app.quit();
  });
});

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function summarizeLarkOAuthResult(result: string): string {
  try {
    const parsed = JSON.parse(result) as {
      user_name?: string;
      user_open_id?: string;
      granted?: string[];
      already_granted?: string[];
      missing?: string[];
    };
    const grantedCount = Array.isArray(parsed.granted) ? parsed.granted.length : 0;
    const alreadyGrantedCount = Array.isArray(parsed.already_granted) ? parsed.already_granted.length : 0;
    const missing = Array.isArray(parsed.missing) && parsed.missing.length ? ` / 缺失 ${parsed.missing.length} 个 scope` : "";
    return `${parsed.user_name || "unknown user"} / ${parsed.user_open_id || "unknown open_id"} / 已授权 ${grantedCount} 个 scope / 已存在 ${alreadyGrantedCount} 个 scope${missing}`;
  } catch {
    return result.slice(0, 500);
  }
}

runtime.on("snapshot", (snapshot) => sendToRenderer("runtime:snapshot", snapshot));
runtime.on("log", (entry) => sendToRenderer("runtime:log", entry));

ipcMain.handle("runtime:snapshot", () => runtime.snapshot());
ipcMain.handle("runtime:logs", () => runtime.logger.list());
ipcMain.handle("runtime:diagnostic-log", async () => diagnosticLogText());
ipcMain.handle("app:info", () => appInfo(app.getVersion()));
ipcMain.handle("storage:stats", () => storageStats());
ipcMain.handle("storage:session-detail", (_event, id: string) => storageSessionDetail(id));
ipcMain.handle("skills:preview", (_event, name: string) => skillPreview(name));
ipcMain.handle("storage:clear-expired", async () => {
  await runtime.stop();
  const removed = await clearExpiredStorage();
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理过期会话存储", `${removed} 个会话`);
  return storageStats();
});
ipcMain.handle("storage:clear-selected", async (_event, ids: string[]) => {
  await runtime.stop();
  const removed = await clearSelectedSessionStorage(ids);
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理所选会话存储", `${removed} 个会话`);
  return storageStats();
});
ipcMain.handle("storage:clear-all", async () => {
  await runtime.stop();
  await clearAllSessionStorage();
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理全部会话存储", "机器人配置、飞书授权和用户 Skills 已保留");
  return storageStats();
});
ipcMain.handle("runtime:start-bot", async (_event, botId: string) => {
  await runtime.startBot(botId);
  return runtime.snapshot();
});
ipcMain.handle("runtime:stop-bot", async (_event, botId: string) => {
  await runtime.stopBot(botId);
  return runtime.snapshot();
});
ipcMain.handle("config:save", async (_event, config: AppConfig) => {
  await runtime.stop();
  await saveConfig(config);
  await runtime.initialize();
  return runtime.snapshot();
});
ipcMain.handle("skills:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "选择包含 SKILL.md 的 Skill 文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return runtime.snapshot();
  const imported = await importSkillFolder(result.filePaths[0]);
  await runtime.initialize(false);
  await runtime.logger.write("success", "Skill 已复制到本地技能市场", imported);
  return runtime.snapshot();
});
ipcMain.handle("skills:market-sync", async () => {
  const config = runtime.snapshot().config;
  await runtime.logger.write("info", "正在同步技能市场", config.skillMarket.repositoryUrl);
  await syncSkillMarket(config.skillMarket);
  await runtime.initialize(false);
  await runtime.logger.write("success", "技能市场同步完成", `${runtime.snapshot().skills.length} 个可用 Skill`);
  return runtime.snapshot();
});
ipcMain.handle("skills:remove-local", async (_event, name: string) => {
  const inUseBy = runtime.snapshot().config.bots.filter((bot) => bot.skillNames.includes(name)).map((bot) => bot.name || bot.id);
  if (inUseBy.length > 0) {
    throw new Error(`Skill 正在被 ${inUseBy.join("、")} 使用，请先在 Bot 配置中取消授权`);
  }
  await runtime.stop();
  await removeLocalSkill(name);
  const config = runtime.snapshot().config;
  for (const bot of config.bots) bot.skillNames = bot.skillNames.filter((skillName) => skillName !== name);
  await saveConfig(config);
  await runtime.initialize(false);
  await runtime.logger.write("success", "已从本地技能市场删除 Skill", name);
  return runtime.snapshot();
});
ipcMain.handle("lark:login-user", async (_event, botId: string) => {
  try {
    const bot = runtime.snapshot().config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    await runtime.logger.write("info", "正在打开飞书用户态授权页面", bot.name, bot.id);
    const result = await loginLarkUser(bot);
    await runtime.logger.write("success", "飞书用户态授权完成", summarizeLarkOAuthResult(result), bot.id);
    await runtime.logger.write(
      "warn",
      "飞书 Bot 可用范围需单独配置",
      "用户态 OAuth 只授权当前用户用于搜索和读取飞书资料，不会把机器人开放给群内其他成员。若其他成员 @ 机器人时看到“暂时还无法与我对话，需要机器人主人的允许”，请到飞书开放平台检查该应用的发布状态和可用范围。",
      bot.id
    );
  } catch (error) {
    await runtime.logger.write("error", "飞书用户态授权失败", String(error), botId);
    throw error;
  }
});

async function diagnosticLogText(): Promise<string> {
  const snapshot = runtime.snapshot();
  const persistentLog = await readFile(path.join(stateRoot(), "logs", "quarkfantools.jsonl"), "utf8").catch(() => "");
  const persistentLines = persistentLog.trim().split(/\r?\n/).filter(Boolean).slice(-2000);
  const botDiagnostics = await Promise.all(snapshot.config.bots.map(async (bot) => {
    const botRoot = path.join(stateRoot(), "bots", bot.id);
    const pidPath = path.join(botRoot, "lark-event-subscriber.pid");
    return {
      id: bot.id,
      name: bot.name,
      stateRoot: botRoot,
      larkConfigDir: path.join(botRoot, "lark-cli"),
      subscriberPid: (await readFile(pidPath, "utf8").catch(() => "")).trim() || null,
      larkLogs: await recentFilesText(path.join(botRoot, "lark-cli", "logs"), 10, 120)
    };
  }));
  return [
    "QuarkfanTools diagnostic log",
    `Generated at: ${new Date().toISOString()}`,
    `App version: ${app.getVersion()}`,
    "",
    "SNAPSHOT",
    JSON.stringify({
      userDataPath: app.getPath("userData"),
      appDataPath: app.getPath("appData"),
      stateRoot: stateRoot(),
      running: snapshot.running,
      runningBotIds: snapshot.runningBotIds,
      connectedBotIds: snapshot.connectedBotIds,
      activeTasks: snapshot.activeTasks,
      queuedTasks: snapshot.queuedTasks,
      bots: snapshot.config.bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        appId: maskAppId(bot.appId),
        enabled: bot.enabled,
        receiveIdentity: bot.receiveIdentity,
        replyIdentity: bot.replyIdentity,
        eventTypes: bot.eventTypes,
        skillCount: bot.skillNames.length,
        showProgress: bot.showProgress
      })),
      model: {
        providerId: snapshot.config.model.providerId,
        providerName: snapshot.config.model.providerName,
        baseUrlConfigured: Boolean(snapshot.config.model.baseUrl),
        model: snapshot.config.model.model,
        apiKeyConfigured: Boolean(snapshot.config.model.apiKey),
        multimodalEnabled: snapshot.config.model.multimodalEnabled
      },
      runtime: snapshot.config.runtime
    }, null, 2),
    "",
    "BOT STATE AND LARK CLI LOGS",
    JSON.stringify(botDiagnostics, null, 2),
    "",
    "RECENT IN-MEMORY LOGS",
    JSON.stringify(runtime.logger.list(), null, 2),
    "",
    "RECENT PERSISTENT LOGS",
    persistentLines.join("\n") || "(empty)"
  ].join("\n");
}

async function recentFilesText(dir: string, maxFiles: number, maxLinesPerFile: number): Promise<Array<{ file: string; modifiedAt: string; tail: string }>> {
  const files = await readdir(dir).catch(() => []);
  const withStats = await Promise.all(files.map(async (file) => {
    const fullPath = path.join(dir, file);
    const fileStat = await stat(fullPath).catch(() => null);
    return fileStat?.isFile() ? { file: fullPath, modifiedAt: fileStat.mtime.toISOString(), mtimeMs: fileStat.mtimeMs } : null;
  }));
  return Promise.all(withStats
    .filter((item): item is { file: string; modifiedAt: string; mtimeMs: number } => Boolean(item))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles)
    .map(async (item) => {
      const content = await readFile(item.file, "utf8").catch((error) => `Unable to read file: ${String(error)}`);
      return {
        file: item.file,
        modifiedAt: item.modifiedAt,
        tail: content.split(/\r?\n/).slice(-maxLinesPerFile).join("\n")
      };
    }));
}
