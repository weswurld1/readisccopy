# Relay

A chat app built with Next.js (App Router). Deploys to Vercel; durable when you
connect Redis, fully functional in-memory if you don't.

## Features
- **Text channels** — `#general`, `#random`, `#dev`.
- **Direct messages** — private 1:1 threads between friends.
- **Friends** — send requests, accept/decline, remove; reciprocal requests
  auto-accept.
- **Presence** — live online/offline dots (30s heartbeat).
- **Voice chat** — real audio via LiveKit when configured (join, mute, live
  participants); falls back to a presence-only room shell when it isn't.
- **Lightweight identity** — claim a username (stored in `localStorage` +
  server presence). No passwords — a demo, not secure; any name is free to take.

## How it works
- `POST /api/sync` — heartbeat + returns online users and your friend state
  (client polls every 3s).
- `GET|POST /api/messages` — channel messages (client polls every 1.5s).
- `GET|POST /api/dm` — direct messages between `me` and `peer`.
- `POST /api/friends` — `request` / `accept` / `decline` / `remove`.
- `GET|POST /api/voice` — join/leave/ping a voice room; returns participants.

All server state lives behind [`app/lib/store.ts`](app/lib/store.ts), which uses
Redis when configured and an in-memory fallback otherwise.

## Storage
Storage auto-selects in [`app/api/messages/store.ts`](app/api/messages/store.ts):

- **Durable + shared** when Upstash Redis / Vercel KV env vars are present —
  messages persist across redeploys, cold starts, and instances.
- **In-memory fallback** when they're not — the app still runs, but messages are
  per-instance and reset on cold starts. The UI shows which mode is active.

### Enable durable storage (Upstash Redis)
Pick one path:

**A. Vercel Marketplace (easiest)**
1. Vercel project → **Storage** → **Create** → **Upstash Redis** → connect.
2. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Redeploy. Done.

**B. Upstash console (manual)**
1. Create a free Redis database at <https://console.upstash.com>.
2. Copy the **REST URL** and **REST TOKEN**.
3. Add env vars in Vercel (Project → Settings → Environment Variables):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Redeploy.

For local durable testing, put the same vars in `.env.local`.

### Enable voice chat (LiveKit)
1. Create a free project at <https://cloud.livekit.io>.
2. Copy the **WebSocket URL** (`wss://…`) and an **API key + secret**.
3. Add these env vars in Vercel (and `.env.local` for local):
   - `NEXT_PUBLIC_LIVEKIT_URL` (the `wss://…` URL — public)
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET` (secret — server-only)
4. Redeploy. The voice room switches from the shell to real audio.

`/api/health` and `/api/voice/token` report whether these are detected.

## Run locally
```bash
npm install
npm run dev
# http://localhost:3000
```

## Deploy to Vercel
1. Push this repo to GitHub.
2. In Vercel: **New Project** → import the repo.
3. Framework preset auto-detects **Next.js**. No env vars, no build changes.
4. Deploy.

Or from the CLI:
```bash
npm i -g vercel
vercel
```

## Rename
"Relay" is a placeholder. Change it in `app/layout.tsx` (title), `app/page.tsx`
(the `.brand`), and `package.json` (`name`).
