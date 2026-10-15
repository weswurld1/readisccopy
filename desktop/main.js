const { app, BrowserWindow, shell, session } = require("electron");

// The hosted Relay app this desktop shell loads.
// Change this to YOUR Vercel URL (or set RELAY_URL in the environment).
const APP_URL = process.env.RELAY_URL || "https://readisccopy.vercel.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: "#1a1b1e",
    title: "Relay",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  // Open links to other sites in the user's real browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const appOrigin = new URL(APP_URL).origin;
      if (new URL(url).origin !== appOrigin) {
        shell.openExternal(url);
        return { action: "deny" };
      }
    } catch {}
    return { action: "allow" };
  });
}

app.whenReady().then(() => {
  // Allow microphone (and camera) so LiveKit voice works inside the app.
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      callback(permission === "media" || permission === "mediaKeySystem");
    }
  );
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => permission === "media"
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
