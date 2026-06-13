import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { QuarkfanToolsRuntime } from "./runtime.js";
import { saveConfig } from "./config.js";
import { migrateLegacyData } from "./paths.js";
import { loginLarkUser } from "./lark-cli.js";
import { importSkillFolder } from "./skills.js";
import type { AppConfig } from "./types.js";

const runtime = new QuarkfanToolsRuntime();
let mainWindow: BrowserWindow | null = null;

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

  if (!app.isPackaged) {
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    void mainWindow.loadFile(path.join(import.meta.dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  await migrateLegacyData();
  await runtime.initialize();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void runtime.stop();
  if (process.platform !== "darwin") app.quit();
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
ipcMain.handle("runtime:start", async () => {
  await runtime.start();
  return runtime.snapshot();
});
ipcMain.handle("runtime:stop", async () => {
  await runtime.stop();
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
  await importSkillFolder(result.filePaths[0]);
  await runtime.initialize();
  return runtime.snapshot();
});
ipcMain.handle("lark:login-user", async (_event, botId: string) => {
  try {
    const bot = runtime.snapshot().config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    await runtime.logger.write("info", "正在打开飞书用户态授权页面", bot.name);
    const result = await loginLarkUser(bot);
    await runtime.logger.write("success", "飞书用户态授权完成", `${bot.name}: ${result}`);
  } catch (error) {
    await runtime.logger.write("error", "飞书用户态授权失败", String(error));
    throw error;
  }
});
