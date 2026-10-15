import { NextRequest, NextResponse } from "next/server";
import { joinVoice, leaveVoice, voiceParticipants } from "@/app/lib/store";
import { clean, handle } from "@/app/lib/util";

// Voice is a UI shell for now: this tracks *who is in a room* (via presence)
// so the participant list is real, but it carries NO audio. Wire a real-time
// media service (e.g. LiveKit) to the same room id to add audio later.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const room = clean(req.nextUrl.searchParams.get("room"), 40, "lounge");
  const participants = await voiceParticipants(room);
  return NextResponse.json({ room, participants });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const me = handle(b.me);
  const room = clean(b.room, 40, "lounge");
  const action = clean(b.action, 20, "ping");
  if (!me) {
    return NextResponse.json({ error: "me required" }, { status: 400 });
  }
  if (action === "leave") {
    await leaveVoice(room, me);
  } else {
    // "join" and "ping" both refresh presence in the room
    await joinVoice(room, me);
  }
  const participants = await voiceParticipants(room);
  return NextResponse.json({ room, participants });
}
