import { NextRequest, NextResponse } from "next/server";
import {
  addDirectMessage,
  getDirectMessages,
  type Message,
} from "@/app/lib/store";
import { clean, handle, dmTopic } from "@/app/lib/util";
import { publish } from "@/app/lib/pusher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = handle(req.nextUrl.searchParams.get("me"));
  const peer = handle(req.nextUrl.searchParams.get("peer"));
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  if (!me || !peer) {
    return NextResponse.json({ error: "me and peer required" }, { status: 400 });
  }
  const messages = await getDirectMessages(me, peer, since);
  return NextResponse.json({ messages, now: Date.now() });
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
  const peer = handle(b.peer);
  const content = clean(b.content, 2000);
  const image = clean(b.image, 2048);
  if (!me || !peer) {
    return NextResponse.json({ error: "me and peer required" }, { status: 400 });
  }
  if (!content && !image) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }
  const message: Message = {
    id: crypto.randomUUID(),
    author: me,
    content,
    channel: "dm",
    ts: Date.now(),
    ...(image ? { image } : {}),
  };
  await addDirectMessage(me, peer, message);
  await publish(dmTopic(me, peer), "new-message", message);
  return NextResponse.json({ message });
}
