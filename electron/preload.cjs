const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quarkfanTools", {
  snapshot: () => ipcRenderer.invoke("runtime:snapshot"),
  logs: () => ipcRenderer.invoke("runtime:logs"),
  start: () => ipcRenderer.invoke("runtime:start"),
  stop: () => ipcRenderer.invoke("runtime:stop"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  openSkills: () => ipcRenderer.invoke("skills:open"),
  loginLarkUser: () => ipcRenderer.invoke("lark:login-user"),
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
