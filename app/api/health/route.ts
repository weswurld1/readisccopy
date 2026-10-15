import { NextResponse } from "next/server";
import { durable, storeEnv, ping } from "@/app/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const redis = await ping();
  const voice = {
    enabled: !!(
      process.env.NEXT_PUBLIC_LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET
    ),
    env: {
      NEXT_PUBLIC_LIVEKIT_URL: !!process.env.NEXT_PUBLIC_LIVEKIT_URL,
      LIVEKIT_API_KEY: !!process.env.LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET: !!process.env.LIVEKIT_API_SECRET,
    },
  };
  return NextResponse.json({
    durable,
    redis, // { ok: true } means Redis is reachable and storage persists
    voice, // voice.enabled true means LiveKit audio is configured
    uploads: !!process.env.BLOB_READ_WRITE_TOKEN, // image uploads (Vercel Blob)
    auth: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, // Clerk sign-in
    realtime:
      !!process.env.NEXT_PUBLIC_PUSHER_KEY &&
      !!process.env.PUSHER_SECRET, // Pusher push messaging
    env: storeEnv(), // which Redis env vars are present (names only, no values)
    mode: durable ? "synced (redis)" : "in-memory (ephemeral)",
  });
}
