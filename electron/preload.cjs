const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quarkfanTools", {
  snapshot: () => ipcRenderer.invoke("runtime:snapshot"),
  logs: () => ipcRenderer.invoke("runtime:logs"),
  scheduledRuns: () => ipcRenderer.invoke("scheduled:runs"),
  runScheduledTaskNow: (botId, taskId) => ipcRenderer.invoke("scheduled:run-now", botId, taskId),
  mcpDiagnostics: (probeProtocol) => ipcRenderer.invoke("mcp:diagnostics", probeProtocol),
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
  startBot: (botId) => ipcRenderer.invoke("runtime:start-bot", botId),
  stopBot: (botId) => ipcRenderer.invoke("runtime:stop-bot", botId),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  importSkill: () => ipcRenderer.invoke("skills:import"),
  importCustomApp: () => ipcRenderer.invoke("apps:import"),
  importSuite: () => ipcRenderer.invoke("suites:import"),
  syncSkillMarket: () => ipcRenderer.invoke("skills:market-sync"),
  removeLocalSkill: (name) => ipcRenderer.invoke("skills:remove-local", name),
  loginLarkUser: (botId) => ipcRenderer.invoke("lark:login-user", botId),
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
