import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { clean, handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  // Not configured -> the UI falls back to the presence-only voice shell.
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ enabled: false });
  }

  const room = clean(req.nextUrl.searchParams.get("room"), 40, "lounge");
  const identity = handle(req.nextUrl.searchParams.get("identity"));
  if (!identity) {
    return NextResponse.json({ error: "identity required" }, { status: 400 });
  }

  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();

  return NextResponse.json({ enabled: true, token, url, room });
}
