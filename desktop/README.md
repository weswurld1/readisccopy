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

## 3. Build the shareable Windows app
```bash
cd desktop
npm install
npm run dist
```
Output lands in `desktop/dist/`:
- **`Relay-<version>-win.zip`** — unzip and run `Relay.exe`. Send this to
  friends; they need no Node, repo, or browser.

### Want a one-click installer (.exe) instead?
The `nsis` installer target needs **Windows Developer Mode** enabled (Settings →
Privacy & security → For developers → Developer Mode **On**). electron-builder's
code-sign helper archive contains symlinks that Windows won't extract without
that privilege. Once it's on, set `"win": { "target": ["nsis", "zip"] }` in
`package.json` and re-run `npm run dist` to also get `Relay Setup <version>.exe`.

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
