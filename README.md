# Relay

A minimal chat app built with Next.js (App Router) — **no database**. Deploys to
Vercel with zero configuration.

## How it works
- UI polls `GET /api/messages?channel=…&since=…` every 1.5s for new messages.
- `POST /api/messages` appends a message to an in-memory store.
- Your display name is kept in `localStorage` (per-browser convenience only).

## ⚠️ No-database caveat
Messages are held in memory inside the serverless function. That means they:
- reset on every redeploy and on cold starts, and
- are **not shared** across Vercel instances/regions (two visitors may hit
  different instances and not see each other).

This is intentional for now. To make it durable, replace the `store` in
[`app/api/messages/route.ts`](app/api/messages/route.ts) with a real backend —
e.g. Upstash Redis (`@upstash/redis`), Vercel KV, or any database — keeping the
same GET/POST shape.

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
