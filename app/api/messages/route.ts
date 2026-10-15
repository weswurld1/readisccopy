import { NextRequest, NextResponse } from "next/server";
import {
  addChannelMessage,
  getChannelMessages,
  addGuildMessage,
  getGuildMessages,
  editChannelMessage,
  deleteChannelMessage,
  isGuildMember,
  durable,
  type Message,
} from "@/app/lib/store";
import { clean, handle, channelTopic } from "@/app/lib/util";
import { publish } from "@/app/lib/pusher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const channel = clean(req.nextUrl.searchParams.get("channel"), 40, "general");
  const guild = clean(req.nextUrl.searchParams.get("guild"), 16);
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  const messages = guild
    ? await getGuildMessages(guild, channel, since)
    : await getChannelMessages(channel, since);
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
  const guild = clean(b.guild, 16);
  const image = clean(b.image, 2048);
  if (!content && !image) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }
  const message: Message = {
    id: crypto.randomUUID(),
    author,
    content,
    channel,
    ts: Date.now(),
    ...(image ? { image } : {}),
  };
  if (guild) {
    if (!(await isGuildMember(guild, author))) {
      return NextResponse.json({ error: "not a member" }, { status: 403 });
    }
    await addGuildMessage(guild, channel, message);
  } else {
    await addChannelMessage(message);
  }
  await publish(channelTopic(guild, channel), "new-message", message);
  return NextResponse.json({ message });
}

export async function PATCH(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(b.id, 64);
  const author = handle(b.author);
  const channel = clean(b.channel, 40, "general");
  const guild = clean(b.guild, 16);
  const content = clean(b.content, 2000);
  if (!id || !author || !content) {
    return NextResponse.json({ error: "id, author, content" }, { status: 400 });
  }
  const updated = await editChannelMessage(guild, channel, id, author, content);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  await publish(channelTopic(guild, channel), "update-message", updated);
  return NextResponse.json({ message: updated });
}

export async function DELETE(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(b.id, 64);
  const author = handle(b.author);
  const channel = clean(b.channel, 40, "general");
  const guild = clean(b.guild, 16);
  if (!id || !author) {
    return NextResponse.json({ error: "id, author" }, { status: 400 });
  }
  const ok = await deleteChannelMessage(guild, channel, id, author);
  if (ok) await publish(channelTopic(guild, channel), "delete-message", { id });
  return NextResponse.json({ ok });
}
