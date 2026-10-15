# Relay Desktop (Windows, Electron)

A thin Electron shell that loads the hosted Relay web app. All features (chat,
DMs, friends, voice) run against your live Vercel deployment, so the desktop app
stays in sync whenever you redeploy — no rebuild needed for content changes.

## 1. Set your app URL
Edit `main.js` and change `APP_URL` to your Vercel URL, e.g.
`https://readisccopy.vercel.app`. (Or run with `RELAY_URL=... npm start`.)

## 2. Run it locally (dev)
```bash
cd desktop
npm install        # downloads Electron (~100 MB) the first time
npm start
```
A native window opens running Relay. Microphone is granted automatically so
LiveKit voice works.

## 3. Build the shareable Windows installer
```bash
cd desktop
npm install
npm run dist
```
Output lands in `desktop/dist/`:
- **`Relay Setup <version>.exe`** — an installer your friends run (creates a
  Start-menu + desktop shortcut).
- **`Relay <version>.exe`** — a portable single-file exe (no install).

Send either file to your friends. They don't need Node, the repo, or a browser
open — just the exe.

## Notes & caveats
- **Windows SmartScreen:** unsigned apps show a "Windows protected your PC"
  warning. Users click **More info → Run anyway**. To remove it you need a code
  signing certificate (paid, ~$100+/yr) — optional.
- **Internet required:** the app loads the hosted site, so friends need a
  connection (normal for any chat app).
- **Icon:** drop a 256×256 `build/icon.ico` to brand the window/installer;
  otherwise the default Electron icon is used.
- This shell bundles Chromium (that's how Electron — and Discord — work). For a
  much smaller, non-bundled build, Tauri is the alternative.
