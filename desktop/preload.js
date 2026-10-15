const { contextBridge, ipcRenderer } = require("electron");

// Expose a tiny bridge the web app uses to learn the detected game.
// The renderer stays sandboxed; only this channel crosses over.
contextBridge.exposeInMainWorld("relay", {
  onActivity: (cb) => {
    ipcRenderer.on("relay:activity", (_event, game) => cb(game));
  },
});
