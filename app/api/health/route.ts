import { NextResponse } from "next/server";
import { durable, storeEnv, ping } from "@/app/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const redis = await ping();
  return NextResponse.json({
    durable,
    redis, // { ok: true } means Redis is reachable and storage persists
    env: storeEnv(), // which env vars are present (names only, no values)
    mode: durable ? "synced (redis)" : "in-memory (ephemeral)",
  });
}
