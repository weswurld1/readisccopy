import { NextRequest, NextResponse } from "next/server";
import {
  requestFriend,
  acceptFriend,
  declineFriend,
  removeFriend,
  getFriendState,
} from "@/app/lib/store";
import { clean, handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const me = handle(b.me);
  const target = handle(b.target);
  const action = clean(b.action, 20);
  if (!me || !target || !action) {
    return NextResponse.json(
      { error: "me, target, action required" },
      { status: 400 }
    );
  }
  if (me === target) {
    return NextResponse.json(
      { error: "cannot friend yourself" },
      { status: 400 }
    );
  }

  switch (action) {
    case "request":
      await requestFriend(me, target);
      break;
    case "accept":
      await acceptFriend(me, target);
      break;
    case "decline":
      await declineFriend(me, target);
      break;
    case "remove":
      await removeFriend(me, target);
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const friends = await getFriendState(me);
  return NextResponse.json({ friends });
}
