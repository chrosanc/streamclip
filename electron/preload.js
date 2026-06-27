const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("getSettings"),
  saveSettings: (s) => ipcRenderer.invoke("saveSettings", s),
  runClipper: (opts) => ipcRenderer.invoke("runClipper", opts),
  stopClipper: () => ipcRenderer.invoke("stopClipper"),
  openFolder: (p) => ipcRenderer.invoke("openFolder", p),
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  openOutput: () => ipcRenderer.invoke("openOutput"),
  pickFolder: () => ipcRenderer.invoke("pickFolder"),
  pickFile: () => ipcRenderer.invoke("pickFile"),
  getVideoDuration: (path) => ipcRenderer.invoke("getVideoDuration", path),
  onProgress: (cb) => ipcRenderer.on("clipperProgress", (_, data) => cb(data)),
});
