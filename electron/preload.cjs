const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quarkfanTools", {
  snapshot: () => ipcRenderer.invoke("runtime:snapshot"),
  logs: () => ipcRenderer.invoke("runtime:logs"),
  scheduledRuns: () => ipcRenderer.invoke("scheduled:runs"),
  runScheduledTaskNow: (botId, taskId) => ipcRenderer.invoke("scheduled:run-now", botId, taskId),
  mcpDiagnostics: (probeProtocol) => ipcRenderer.invoke("mcp:diagnostics", probeProtocol),
  platformDiagnostics: () => ipcRenderer.invoke("platform:diagnostics"),
  capabilityAudit: () => ipcRenderer.invoke("capability:audit"),
  appInfo: () => ipcRenderer.invoke("app:info"),
  storageStats: () => ipcRenderer.invoke("storage:stats"),
  storageSessionDetail: (id) => ipcRenderer.invoke("storage:session-detail", id),
  skillPreview: (name) => ipcRenderer.invoke("skills:preview", name),
  customAppPreview: (id) => ipcRenderer.invoke("apps:preview", id),
  suitePreview: (id) => ipcRenderer.invoke("suites:preview", id),
  showResourceInFolder: (kind, id) => ipcRenderer.invoke("resource:show-in-folder", kind, id),
  clearExpiredStorage: () => ipcRenderer.invoke("storage:clear-expired"),
  clearSelectedStorage: (ids) => ipcRenderer.invoke("storage:clear-selected", ids),
  clearAllSessionStorage: () => ipcRenderer.invoke("storage:clear-all"),
  clearFileCacheStorage: () => ipcRenderer.invoke("storage:clear-cache"),
  clearFileCacheEntryStorage: (cacheKey) => ipcRenderer.invoke("storage:clear-cache-entry", cacheKey),
  repairFileCacheStorage: () => ipcRenderer.invoke("storage:repair-cache"),
  clearCustomAppArtifactsStorage: () => ipcRenderer.invoke("storage:clear-custom-app-artifacts"),
  clearExpiredCustomAppArtifactsStorage: () => ipcRenderer.invoke("storage:clear-expired-custom-app-artifacts"),
  startBot: (botId) => ipcRenderer.invoke("runtime:start-bot", botId),
  stopBot: (botId) => ipcRenderer.invoke("runtime:stop-bot", botId),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  importSkill: () => ipcRenderer.invoke("skills:import"),
  importCustomApp: () => ipcRenderer.invoke("apps:import"),
  upgradeCustomApp: () => ipcRenderer.invoke("apps:upgrade"),
  removeCustomApp: (id) => ipcRenderer.invoke("apps:remove", id),
  saveCustomAppManifest: (id, manifestText) => ipcRenderer.invoke("apps:save-manifest", id, manifestText),
  copyCustomAppTemplate: (id, newId) => ipcRenderer.invoke("apps:copy-template", id, newId),
  importSuite: () => ipcRenderer.invoke("suites:import"),
  upgradeSuite: () => ipcRenderer.invoke("suites:upgrade"),
  removeSuite: (id) => ipcRenderer.invoke("suites:remove", id),
  saveSuiteManifest: (id, manifestText) => ipcRenderer.invoke("suites:save-manifest", id, manifestText),
  copySuiteTemplate: (id, newId) => ipcRenderer.invoke("suites:copy-template", id, newId),
  syncSkillMarket: () => ipcRenderer.invoke("skills:market-sync"),
  removeLocalSkill: (name) => ipcRenderer.invoke("skills:remove-local", name),
  loginLarkUser: (botId) => ipcRenderer.invoke("lark:login-user", botId),
  initWeComCli: (botId) => ipcRenderer.invoke("wecom:init", botId),
  weComChatList: (botId) => ipcRenderer.invoke("wecom:chat-list", botId),
  onSnapshot: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("runtime:snapshot", listener);
    return () => ipcRenderer.removeListener("runtime:snapshot", listener);
  },
  onLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("runtime:log", listener);
    return () => ipcRenderer.removeListener("runtime:log", listener);
  }
});
