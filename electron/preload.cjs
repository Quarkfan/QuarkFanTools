const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quarkfanTools", {
  snapshot: () => ipcRenderer.invoke("runtime:snapshot"),
  logs: () => ipcRenderer.invoke("runtime:logs"),
  diagnosticLog: () => ipcRenderer.invoke("runtime:diagnostic-log"),
  appInfo: () => ipcRenderer.invoke("app:info"),
  storageStats: () => ipcRenderer.invoke("storage:stats"),
  storageSessionDetail: (id) => ipcRenderer.invoke("storage:session-detail", id),
  skillPreview: (name) => ipcRenderer.invoke("skills:preview", name),
  clearExpiredStorage: () => ipcRenderer.invoke("storage:clear-expired"),
  clearSelectedStorage: (ids) => ipcRenderer.invoke("storage:clear-selected", ids),
  clearAllSessionStorage: () => ipcRenderer.invoke("storage:clear-all"),
  startBot: (botId) => ipcRenderer.invoke("runtime:start-bot", botId),
  stopBot: (botId) => ipcRenderer.invoke("runtime:stop-bot", botId),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  importSkill: () => ipcRenderer.invoke("skills:import"),
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
