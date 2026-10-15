import { NextRequest, NextResponse } from "next/server";
import {
  registerUser,
  heartbeat,
  onlineUsers,
  getFriendState,
  durable,
} from "@/app/lib/store";
import { handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const me = handle((body as Record<string, unknown>).me);
  if (!me) {
    const online = await onlineUsers();
    return NextResponse.json({ online, durable, friends: null });
  }
  await registerUser(me);
  await heartbeat(me);
  const [online, friends] = await Promise.all([
    onlineUsers(),
    getFriendState(me),
  ]);
  return NextResponse.json({ online, friends, durable });
}
