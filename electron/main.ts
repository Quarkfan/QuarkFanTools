import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { QuarkfanToolsRuntime } from "./runtime.js";
import { saveConfig } from "./config.js";
import { migrateLegacyData } from "./paths.js";
import { loginLarkUser } from "./lark-cli.js";
import { fetchWeComChatList, initializeWeComCli } from "./wecom-cli.js";
import { mcpServerDiagnostics } from "./mcp-diagnostics.js";
import { platformConnectorDiagnostics } from "./platform-diagnostics.js";
import { capabilityAuditReport } from "./capability-audit.js";
import { importSkillFolder, removeLocalSkill, skillPreview } from "./skills.js";
import { copyCustomAppTemplate, customAppPreview, importCustomAppFolder, removeCustomAppFolder, saveCustomAppManifest, upgradeCustomAppFolder } from "./apps.js";
import { copySuiteTemplate, importSuiteFolder, removeSuiteFolder, saveSuiteManifest, suitePreview, upgradeSuiteFolder } from "./suites.js";
import { syncSkillMarket } from "./skill-market.js";
import { scheduledTaskRunHistory } from "./scheduled-tasks.js";
import { clearAllCustomAppArtifactStorage, clearAllSessionStorage, clearExpiredCustomAppArtifactStorage, clearExpiredStorage, clearFileCacheEntryStorage, clearFileCacheStorage, clearSelectedSessionStorage, repairFileCacheStorage, storageSessionDetail, storageStats } from "./storage.js";
import { appInfo } from "./release-notes.js";
import { resourceDirectory, type ResourceLocationKind } from "./resource-locations.js";
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
ipcMain.handle("scheduled:runs", () => scheduledTaskRunHistory(runtime.snapshot().config));
ipcMain.handle("scheduled:run-now", async (_event, botId: string, taskId: string) => runtime.triggerScheduledTaskNow(botId, taskId));
ipcMain.handle("mcp:diagnostics", (_event, probeProtocol?: boolean) => mcpServerDiagnostics(runtime.snapshot().config, { probeProtocol: Boolean(probeProtocol) }));
ipcMain.handle("platform:diagnostics", () => platformConnectorDiagnostics(runtime.snapshot().config));
ipcMain.handle("capability:audit", () => capabilityAuditReport(runtime.snapshot().config));
ipcMain.handle("app:info", () => appInfo(app.getVersion()));
ipcMain.handle("storage:stats", () => storageStats(runtime.snapshot().config));
ipcMain.handle("storage:session-detail", (_event, id: string) => storageSessionDetail(id));
ipcMain.handle("skills:preview", (_event, name: string) => skillPreview(name));
ipcMain.handle("apps:preview", (_event, id: string) => customAppPreview(id));
ipcMain.handle("suites:preview", (_event, id: string) => suitePreview(id));
ipcMain.handle("resource:show-in-folder", async (_event, kind: ResourceLocationKind, id: string) => {
  const directory = await resourceDirectory({ kind, id });
  const error = await shell.openPath(directory);
  if (error) throw new Error(error);
});
ipcMain.handle("storage:clear-expired", async () => {
  await runtime.stop();
  const removed = await clearExpiredStorage();
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理过期会话存储", `${removed} 个会话`);
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:clear-selected", async (_event, ids: string[]) => {
  await runtime.stop();
  const removed = await clearSelectedSessionStorage(ids);
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理所选会话存储", `${removed} 个会话`);
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:clear-all", async () => {
  await runtime.stop();
  await clearAllSessionStorage();
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理全部会话存储", "机器人配置、飞书授权和用户 Skills 已保留");
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:clear-cache", async () => {
  await runtime.stop();
  await clearFileCacheStorage();
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理文件缓存", "会话上下文、机器人配置、飞书授权和用户 Skills 已保留");
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:clear-cache-entry", async (_event, cacheKey: string) => {
  const removed = await clearFileCacheEntryStorage(String(cacheKey ?? ""));
  await runtime.logger.write(removed ? "success" : "warn", removed ? "已删除文件缓存条目" : "文件缓存条目不存在", String(cacheKey ?? ""));
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:repair-cache", async () => {
  const report = await repairFileCacheStorage();
  await runtime.logger.write("success", "文件缓存索引校验完成", `移除索引 ${report.removedEntries} 条 / 移除孤立内容 ${report.removedHashes} 个 / 修复字段 ${report.repairedEntries} 处`);
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:clear-custom-app-artifacts", async () => {
  await runtime.stop();
  const removed = await clearAllCustomAppArtifactStorage();
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理自定义应用运行产物", `${removed} 个应用 workspace；配置、授权和应用本体已保留`);
  return storageStats(runtime.snapshot().config);
});
ipcMain.handle("storage:clear-expired-custom-app-artifacts", async () => {
  await runtime.stop();
  const removed = await clearExpiredCustomAppArtifactStorage(runtime.snapshot().config);
  await runtime.initialize(false);
  await runtime.logger.write("success", "已清理过期自定义应用运行产物", `${removed} 个应用 workspace；配置、授权和应用本体已保留`);
  return storageStats(runtime.snapshot().config);
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
ipcMain.handle("apps:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "选择包含 app.json 的自定义应用文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return runtime.snapshot();
  const imported = await importCustomAppFolder(result.filePaths[0]);
  await runtime.initialize(false);
  await runtime.logger.write("success", "自定义应用已导入", imported);
  return runtime.snapshot();
});
ipcMain.handle("apps:upgrade", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "选择新版自定义应用文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return runtime.snapshot();
  const upgraded = await upgradeCustomAppFolder(result.filePaths[0]);
  await runtime.initialize(false);
  await runtime.logger.write("success", "自定义应用已升级", upgraded);
  return runtime.snapshot();
});
ipcMain.handle("apps:remove", async (_event, id: string) => {
  const snapshot = runtime.snapshot();
  const appToRemove = snapshot.customApps.find((app) => app.id === id);
  if (appToRemove?.source === "builtin") throw new Error("内置自定义应用模板不能卸载。");
  const inUseBy = snapshot.config.bots.filter((bot) => bot.capabilityRefs?.some((ref) => ref.kind === "app" && ref.id === id && ref.enabled)).map((bot) => bot.name || bot.id);
  if (inUseBy.length > 0) throw new Error(`自定义应用仍被 Bot 授权使用：${inUseBy.join("、")}`);
  const suiteInUseBy = snapshot.suites.filter((suite) => suite.apps.includes(id)).map((suite) => suite.name || suite.id);
  if (suiteInUseBy.length > 0) throw new Error(`自定义应用仍被套件引用：${suiteInUseBy.join("、")}`);
  await removeCustomAppFolder(String(id ?? ""));
  await runtime.initialize(false);
  await runtime.logger.write("success", "自定义应用已卸载", String(id ?? ""));
  return runtime.snapshot();
});
ipcMain.handle("apps:save-manifest", async (_event, id: string, manifestText: string) => {
  const saved = await saveCustomAppManifest(String(id ?? ""), String(manifestText ?? ""));
  await runtime.initialize(false);
  await runtime.logger.write("success", "自定义应用 manifest 已保存", saved);
  return runtime.snapshot();
});
ipcMain.handle("apps:copy-template", async (_event, id: string, newId: string) => {
  const copied = await copyCustomAppTemplate(String(id ?? ""), String(newId ?? ""));
  await runtime.initialize(false);
  await runtime.logger.write("success", "自定义应用模板已复制为本地副本", copied);
  return runtime.snapshot();
});
ipcMain.handle("suites:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "选择包含 suite.json 的套件文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return runtime.snapshot();
  const imported = await importSuiteFolder(result.filePaths[0]);
  await runtime.initialize(false);
  await runtime.logger.write("success", "套件已导入", imported);
  return runtime.snapshot();
});
ipcMain.handle("suites:save-manifest", async (_event, id: string, manifestText: string) => {
  const saved = await saveSuiteManifest(String(id ?? ""), String(manifestText ?? ""));
  await runtime.initialize(false);
  await runtime.logger.write("success", "套件 manifest 已保存", saved);
  return runtime.snapshot();
});
ipcMain.handle("suites:copy-template", async (_event, id: string, newId: string) => {
  const copied = await copySuiteTemplate(String(id ?? ""), String(newId ?? ""));
  await runtime.initialize(false);
  await runtime.logger.write("success", "套件模板已复制为本地副本", copied);
  return runtime.snapshot();
});
ipcMain.handle("suites:upgrade", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "选择新版套件文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return runtime.snapshot();
  const upgraded = await upgradeSuiteFolder(result.filePaths[0]);
  await runtime.initialize(false);
  await runtime.logger.write("success", "套件已升级", upgraded);
  return runtime.snapshot();
});
ipcMain.handle("suites:remove", async (_event, id: string) => {
  const snapshot = runtime.snapshot();
  const suiteId = String(id ?? "");
  const suiteToRemove = snapshot.suites.find((suite) => suite.id === suiteId);
  if (suiteToRemove?.source === "builtin") throw new Error("内置套件模板不能卸载。");
  const isTargetingSuite = (kind: string | undefined, capabilityId: string | undefined) =>
    (kind === "suite" && capabilityId === suiteId) || (kind === "workflow" && capabilityId?.startsWith(`${suiteId}/`));
  const inUseBy = snapshot.config.bots.filter((bot) => bot.capabilityRefs?.some((ref) => ref.kind === "suite" && ref.id === suiteId && ref.enabled)).map((bot) => bot.name || bot.id);
  if (inUseBy.length > 0) throw new Error(`套件仍被 Bot 授权使用：${inUseBy.join("、")}`);
  const commandInUseBy = snapshot.config.bots.flatMap((bot) => (bot.commandBindings ?? [])
    .filter((binding) => binding.enabled && isTargetingSuite(binding.target.capability?.kind, binding.target.capability?.id))
    .map((binding) => `${bot.name || bot.id}/${binding.name}`));
  if (commandInUseBy.length > 0) throw new Error(`套件仍被命令引用：${commandInUseBy.join("、")}`);
  const scheduledInUseBy = snapshot.config.bots.flatMap((bot) => (bot.scheduledTasks ?? [])
    .filter((task) => task.enabled && isTargetingSuite(task.target.capability?.kind, task.target.capability?.id))
    .map((task) => `${bot.name || bot.id}/${task.name || task.id}`));
  if (scheduledInUseBy.length > 0) throw new Error(`套件仍被定时任务引用：${scheduledInUseBy.join("、")}`);
  await removeSuiteFolder(suiteId);
  await runtime.initialize(false);
  await runtime.logger.write("success", "套件已卸载", suiteId);
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
ipcMain.handle("wecom:init", async (_event, botId: string) => {
  try {
    const bot = runtime.snapshot().config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    if ((bot.provider ?? "lark") !== "wecom") throw new Error("当前机器人不是企业微信消息平台");
    await runtime.logger.write("info", "正在初始化企业微信 CLI 缓存", "应用会使用当前 Bot 配置中的企业微信 Bot ID / Secret 写入隔离 CLI 缓存，并拉取官方 MCP 配置。", bot.id);
    const result = await initializeWeComCli(bot);
    await runtime.logger.write("success", "企业微信 CLI 缓存初始化完成", summarizeWeComInitResult(result.output), bot.id);
    return { output: result.output };
  } catch (error) {
    await runtime.logger.write("error", "企业微信 CLI 缓存初始化失败", String(error instanceof Error ? error.message : error), botId);
    throw error;
  }
});
ipcMain.handle("wecom:chat-list", async (_event, botId: string) => {
  try {
    const bot = runtime.snapshot().config.bots.find((item) => item.id === botId);
    if (!bot) throw new Error("机器人不存在");
    if ((bot.provider ?? "lark") !== "wecom") throw new Error("当前机器人不是企业微信消息平台");
    await runtime.logger.write("info", "正在获取企业微信聊天列表", "应用会调用官方 wecom-cli msg get_msg_chat_list 拉取最近 7 天内有消息的会话。", bot.id);
    const result = await fetchWeComChatList(bot);
    await runtime.logger.write("success", "企业微信聊天列表获取完成", `获取 ${result.chats.length} 个会话，时间范围 ${result.beginTime} - ${result.endTime}。`, bot.id);
    return result;
  } catch (error) {
    await runtime.logger.write("error", "企业微信聊天列表获取失败", String(error instanceof Error ? error.message : error), botId);
    throw error;
  }
});

function summarizeWeComInitResult(output: string): string {
  const cleaned = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/[▀▄█]/.test(line))
    .slice(-8)
    .join("\n");
  return cleaned || "官方 wecom-cli 缓存已初始化。";
}
