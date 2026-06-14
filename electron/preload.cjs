const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quarkfanTools", {
  snapshot: () => ipcRenderer.invoke("runtime:snapshot"),
  logs: () => ipcRenderer.invoke("runtime:logs"),
  storageStats: () => ipcRenderer.invoke("storage:stats"),
  clearExpiredStorage: () => ipcRenderer.invoke("storage:clear-expired"),
  clearSelectedStorage: (ids) => ipcRenderer.invoke("storage:clear-selected", ids),
  clearAllSessionStorage: () => ipcRenderer.invoke("storage:clear-all"),
  startBot: (botId) => ipcRenderer.invoke("runtime:start-bot", botId),
  stopBot: (botId) => ipcRenderer.invoke("runtime:stop-bot", botId),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  importSkill: () => ipcRenderer.invoke("skills:import"),
  syncSkillMarket: () => ipcRenderer.invoke("skills:market-sync"),
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
