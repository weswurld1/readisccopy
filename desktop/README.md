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
- **`Relay Setup <version>.exe`** — a one-click installer (~71 MB, LZMA-
  compressed). Send this to friends; they just run it. No Node, repo, or
  browser needed.

The build sets `signAndEditExecutable: false` and runs with
`CSC_IDENTITY_AUTO_DISCOVERY=false` (see `package.json` / `npm run dist`), which
skips code-signing. That avoids electron-builder's winCodeSign helper, whose
archive contains symlinks Windows refuses to extract without Developer Mode — so
no special privileges are required. `compression: "maximum"` +
`electronLanguages: ["en-US"]` keep the installer small.

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
