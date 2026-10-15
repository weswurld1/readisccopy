const {
  app,
  BrowserWindow,
  shell,
  session,
  desktopCapturer,
  ipcMain,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const { exec } = require("child_process");

// "games database": process executable -> display name.
const GAMES = {
  "cs2.exe": "Counter-Strike 2",
  "csgo.exe": "Counter-Strike",
  "valorant.exe": "VALORANT",
  "valorant-win64-shipping.exe": "VALORANT",
  "leagueoflegends.exe": "League of Legends",
  "league of legends.exe": "League of Legends",
  "fortniteclient-win64-shipping.exe": "Fortnite",
  "minecraft.exe": "Minecraft",
  "minecraftlauncher.exe": "Minecraft",
  "javaw.exe": "Minecraft",
  "gta5.exe": "GTA V",
  "gtav.exe": "GTA V",
  "gta5_enhanced.exe": "GTA V",
  "rainbowsix.exe": "Rainbow Six Siege",
  "rainbowsix_vulkan.exe": "Rainbow Six Siege",
  "overwatch.exe": "Overwatch 2",
  "dota2.exe": "Dota 2",
  "r5apex.exe": "Apex Legends",
  "r5apex_dx12.exe": "Apex Legends",
  "eldenring.exe": "Elden Ring",
  "cyberpunk2077.exe": "Cyberpunk 2077",
  "rocketleague.exe": "Rocket League",
  "wow.exe": "World of Warcraft",
  "destiny2.exe": "Destiny 2",
  "bf2042.exe": "Battlefield 2042",
  "bf1.exe": "Battlefield 1",
  "pubg.exe": "PUBG: Battlegrounds",
  "tslgame.exe": "PUBG: Battlegrounds",
  "warframe.x64.exe": "Warframe",
  "fallguys_client_game.exe": "Fall Guys",
  "fallguys_client.exe": "Fall Guys",
  "rust.exe": "Rust",
  "deadbydaylight-win64-shipping.exe": "Dead by Daylight",
  "terraria.exe": "Terraria",
  "stardew valley.exe": "Stardew Valley",
  "stardewvalley.exe": "Stardew Valley",
  "hades.exe": "Hades",
  "hades2.exe": "Hades II",
  "witcher3.exe": "The Witcher 3",
  "re4.exe": "Resident Evil 4",
  "nba2k24.exe": "NBA 2K24",
  "nba2k25.exe": "NBA 2K25",
  "fc24.exe": "EA SPORTS FC 24",
  "fc25.exe": "EA SPORTS FC 25",
  "rdr2.exe": "Red Dead Redemption 2",
  "starfield.exe": "Starfield",
  "baldursgate3.exe": "Baldur's Gate 3",
  "bg3.exe": "Baldur's Gate 3",
  "bg3_dx11.exe": "Baldur's Gate 3",
  "palworld-win64-shipping.exe": "Palworld",
  "helldivers2.exe": "Helldivers 2",
  "marvelrivals.exe": "Marvel Rivals",
  "marvel-win64-shipping.exe": "Marvel Rivals",
  "thefinals.exe": "The Finals",
  "discovery.exe": "The Finals",
  "wuthering waves.exe": "Wuthering Waves",
  "client-win64-shipping.exe": "Wuthering Waves",
  "genshinimpact.exe": "Genshin Impact",
  "yuanshen.exe": "Genshin Impact",
  "zenlesszonezero.exe": "Zenless Zone Zero",
  "sims4.exe": "The Sims 4",
  "ts4_x64.exe": "The Sims 4",
  "factorio.exe": "Factorio",
  "satisfactory.exe": "Satisfactory",
  "factorygame-win64-shipping.exe": "Satisfactory",
  "project zomboid.exe": "Project Zomboid",
  "eldenringnightreign.exe": "Elden Ring Nightreign",
  "steam.exe": "Steam",
};

function detectGame(win) {
  if (process.platform !== "win32" || win.isDestroyed()) return;
  exec("tasklist /fo csv /nh", { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
    if (err || win.isDestroyed()) return;
    const lower = out.toLowerCase();
    let found = null;
    for (const exe of Object.keys(GAMES)) {
      if (lower.includes(`"${exe}"`)) {
        found = GAMES[exe];
        break;
      }
    }
    win.webContents.send("relay:activity", found);
  });
}

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
      preload: path.join(__dirname, "preload.js"),
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

  // Screen sharing: show a picker so the user chooses a screen or window.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
      })
      .then((sources) => {
        if (win.isDestroyed()) return callback({});
        const list = sources.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL(),
        }));
        win.webContents.send("relay:pick-source", list);
        ipcMain.once("relay:source-chosen", (_e, id) => {
          const src = id ? sources.find((s) => s.id === id) : null;
          callback(src ? { video: src, audio: "loopback" } : {});
        });
      })
      .catch(() => callback({}));
  });

  // Poll running processes and report the detected game to the web app.
  win.webContents.once("did-finish-load", () => detectGame(win));
  const gameTimer = setInterval(() => detectGame(win), 15000);
  win.on("closed", () => clearInterval(gameTimer));
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

  // Auto-update from GitHub Releases (packaged builds only). Downloads a newer
  // release in the background and installs it on next quit.
  if (app.isPackaged) {
    autoUpdater.on("error", (err) => {
      console.error("auto-update error:", err?.message || err);
    });
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
