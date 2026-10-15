import { NextRequest, NextResponse } from "next/server";
import { addMessage, getMessages, durable, type Message } from "./store";

// Durable + shared when Upstash/Vercel KV env vars are set; otherwise an
// in-memory fallback (per-instance, resets on cold start) so the app always runs.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RETURN = 100;

function clean(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max).trim() || fallback;
}

export async function GET(req: NextRequest) {
  const channel = clean(req.nextUrl.searchParams.get("channel"), 40, "general");
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  const messages = (await getMessages(channel, since)).slice(-MAX_RETURN);
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
  const author = clean(b.author, 40, "guest");
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
  await addMessage(message);
  return NextResponse.json({ message });
}
