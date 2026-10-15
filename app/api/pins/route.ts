import { NextRequest, NextResponse } from "next/server";
import { addPin, removePin, getPins, type Message } from "@/app/lib/store";
import { clean, handle, channelTopic, dmTopic } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function topicOf(b: Record<string, unknown>, me: string): string {
  const peer = handle(b.peer);
  if (peer) return dmTopic(me, peer);
  return channelTopic(clean(b.guild, 16), clean(b.channel, 40, "general"));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const me = handle(sp.get("me"));
  const peer = handle(sp.get("peer"));
  const topic = peer
    ? dmTopic(me, peer)
    : channelTopic(clean(sp.get("guild"), 16), clean(sp.get("channel"), 40, "general"));
  return NextResponse.json({ pins: await getPins(topic) });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const me = handle(b.me);
  if (!me) return NextResponse.json({ error: "me required" }, { status: 400 });
  const topic = topicOf(b, me);
  const action = clean(b.action, 10);
  if (action === "unpin") {
    await removePin(topic, clean(b.id, 64));
  } else {
    const msg = b.message as Message | undefined;
    if (!msg || !msg.id) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    await addPin(topic, msg);
  }
  return NextResponse.json({ pins: await getPins(topic) });
}
