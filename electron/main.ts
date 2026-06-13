import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { QuarkfanToolsRuntime } from "./runtime.js";
import { saveConfig } from "./config.js";
import { migrateLegacyData, skillsRoot } from "./paths.js";
import { loginLarkUser } from "./lark-cli.js";
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
ipcMain.handle("skills:open", () => shell.openPath(skillsRoot()));
ipcMain.handle("lark:login-user", async () => {
  try {
    await runtime.logger.write("info", "正在打开飞书用户态授权页面");
    const result = await loginLarkUser(runtime.snapshot().config);
    await runtime.logger.write("success", "飞书用户态授权完成", result);
  } catch (error) {
    await runtime.logger.write("error", "飞书用户态授权失败", String(error));
    throw error;
  }
});
