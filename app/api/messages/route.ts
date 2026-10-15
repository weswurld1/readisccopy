import { NextRequest, NextResponse } from "next/server";

// No database (for now). Messages live in memory on the serverless instance.
// This resets on cold starts and is not shared across regions/instances.
// Swap `store` for Upstash Redis / a DB later to make it durable.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Message = {
  id: string;
  author: string;
  content: string;
  channel: string;
  ts: number;
};

type Store = { messages: Message[] };

const g = globalThis as unknown as { __relayStore?: Store };
const store: Store = g.__relayStore ?? (g.__relayStore = { messages: [] });

const MAX_TOTAL = 1000;
const MAX_RETURN = 100;

function clean(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max).trim() || fallback;
}

export async function GET(req: NextRequest) {
  const channel = clean(req.nextUrl.searchParams.get("channel"), 40, "general");
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  const messages = store.messages
    .filter((m) => m.channel === channel && m.ts > since)
    .slice(-MAX_RETURN);
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
  store.messages.push(message);
  if (store.messages.length > MAX_TOTAL) {
    store.messages = store.messages.slice(-MAX_TOTAL);
  }
  return NextResponse.json({ message });
}
