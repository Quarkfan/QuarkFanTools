import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { QuarkfanToolsRuntime } from "./runtime.js";
import { saveConfig } from "./config.js";
import { migrateLegacyData } from "./paths.js";
import { loginLarkUser } from "./lark-cli.js";
import { importSkillFolder } from "./skills.js";
import { syncSkillMarket } from "./skill-market.js";
import { clearAllSessionStorage, clearExpiredStorage, clearSelectedSessionStorage, storageStats } from "./storage.js";
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

runtime.on("snapshot", (snapshot) => sendToRenderer("runtime:snapshot", snapshot));
runtime.on("log", (entry) => sendToRenderer("runtime:log", entry));

ipcMain.handle("runtime:snapshot", () => runtime.snapshot());
ipcMain.handle("runtime:logs", () => runtime.logger.list());
ipcMain.handle("storage:stats", () => storageStats());
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
ipcMain.handle("lark:login-user", async (_event, botId: string) => {
  try {
    const bot = runtime.snapshot().config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    await runtime.logger.write("info", "正在打开飞书用户态授权页面", bot.name, bot.id);
    const result = await loginLarkUser(bot);
    await runtime.logger.write("success", "飞书用户态授权完成", result, bot.id);
  } catch (error) {
    await runtime.logger.write("error", "飞书用户态授权失败", String(error), botId);
    throw error;
  }
});
