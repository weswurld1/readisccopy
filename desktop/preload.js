const { contextBridge, ipcRenderer } = require("electron");

// Expose a tiny bridge the web app uses to learn the detected game.
// The renderer stays sandboxed; only this channel crosses over.
contextBridge.exposeInMainWorld("relay", {
  onActivity: (cb) => {
    ipcRenderer.on("relay:activity", (_event, game) => cb(game));
  },
  // Screen-share source picker: main sends the available screens/windows,
  // the app shows a chooser, and sends back the picked id (or null to cancel).
  onPickSource: (cb) => {
    ipcRenderer.on("relay:pick-source", (_event, sources) => cb(sources));
  },
  chooseSource: (id) => {
    ipcRenderer.send("relay:source-chosen", id);
  },
});
