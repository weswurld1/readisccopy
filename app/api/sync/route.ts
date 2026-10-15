import { NextRequest, NextResponse } from "next/server";
import {
  registerUser,
  heartbeat,
  onlineUsers,
  getFriendState,
  setAvatar,
  getAvatars,
  durable,
} from "@/app/lib/store";
import { clean, handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = body as Record<string, unknown>;
  const me = handle(b.me);
  const avatar = clean(b.avatar, 2048);
  if (!me) {
    const [online, avatars] = await Promise.all([onlineUsers(), getAvatars()]);
    return NextResponse.json({ online, avatars, durable, friends: null });
  }
  await registerUser(me);
  await heartbeat(me);
  if (avatar) await setAvatar(me, avatar);
  const [online, friends, avatars] = await Promise.all([
    onlineUsers(),
    getFriendState(me),
    getAvatars(),
  ]);
  return NextResponse.json({ online, friends, avatars, durable });
}
