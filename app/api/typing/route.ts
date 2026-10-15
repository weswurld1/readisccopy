import { NextRequest, NextResponse } from "next/server";
import { publish } from "@/app/lib/pusher";
import { clean, handle, channelTopic, dmTopic } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const me = handle(b.me);
  const peer = handle(b.peer);
  const guild = clean(b.guild, 16);
  const channel = clean(b.channel, 40, "general");
  if (!me) return NextResponse.json({ ok: false }, { status: 400 });
  const topic = peer ? dmTopic(me, peer) : channelTopic(guild, channel);
  await publish(topic, "typing", { user: me });
  return NextResponse.json({ ok: true });
}
