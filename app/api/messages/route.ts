import { NextRequest, NextResponse } from "next/server";
import {
  addChannelMessage,
  getChannelMessages,
  durable,
  type Message,
} from "@/app/lib/store";
import { clean, handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const channel = clean(req.nextUrl.searchParams.get("channel"), 40, "general");
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  const messages = await getChannelMessages(channel, since);
  return NextResponse.json({ messages, now: Date.now(), durable });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const content = clean(b.content, 2000);
  const author = handle(b.author) || "guest";
  const channel = clean(b.channel, 40, "general");
  if (!content) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }
  const message: Message = {
    id: crypto.randomUUID(),
    author,
    content,
    channel,
    ts: Date.now(),
  };
  await addChannelMessage(message);
  return NextResponse.json({ message });
}
