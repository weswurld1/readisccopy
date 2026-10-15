# Relay

A minimal chat app built with Next.js (App Router) — **no database**. Deploys to
Vercel with zero configuration.

## How it works
- UI polls `GET /api/messages?channel=…&since=…` every 1.5s for new messages.
- `POST /api/messages` appends a message to an in-memory store.
- Your display name is kept in `localStorage` (per-browser convenience only).

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
