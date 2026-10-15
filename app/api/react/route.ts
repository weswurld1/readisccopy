import { NextRequest, NextResponse } from "next/server";
import { reactChannel, reactDirect } from "@/app/lib/store";
import { publish } from "@/app/lib/pusher";
import { clean, handle, channelTopic, dmTopic } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(b.id, 64);
  const emoji = clean(b.emoji, 16);
  const me = handle(b.me);
  const peer = handle(b.peer);
  const guild = clean(b.guild, 16);
  const channel = clean(b.channel, 40, "general");
  if (!id || !emoji || !me) {
    return NextResponse.json({ error: "id, emoji, me" }, { status: 400 });
  }
  const updated = peer
    ? await reactDirect(me, peer, id, emoji, me)
    : await reactChannel(guild, channel, id, emoji, me);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  const topic = peer ? dmTopic(me, peer) : channelTopic(guild, channel);
  await publish(topic, "update-message", updated);
  return NextResponse.json({ message: updated });
}
