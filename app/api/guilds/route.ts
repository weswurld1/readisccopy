import { NextRequest, NextResponse } from "next/server";
import {
  createGuild,
  listUserGuilds,
  getGuild,
  getGuildChannels,
  addGuildChannel,
  isGuildMember,
  createInvite,
  resolveInvite,
  joinGuild,
} from "@/app/lib/store";
import { clean, handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = handle(req.nextUrl.searchParams.get("me"));
  const gid = clean(req.nextUrl.searchParams.get("gid"), 16);
  if (!me) return NextResponse.json({ error: "me required" }, { status: 400 });

  if (gid) {
    const [guild, channels, member] = await Promise.all([
      getGuild(gid),
      getGuildChannels(gid),
      isGuildMember(gid, me),
    ]);
    return NextResponse.json({ guild, channels, member });
  }
  const guilds = await listUserGuilds(me);
  return NextResponse.json({ guilds });
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
  const action = clean(b.action, 20);
  if (!me || !action) {
    return NextResponse.json({ error: "me, action required" }, { status: 400 });
  }

  if (action === "create") {
    const name = clean(b.name, 40);
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const guild = await createGuild(me, name);
    return NextResponse.json({ guild, guilds: await listUserGuilds(me) });
  }

  if (action === "join") {
    const code = clean(b.code, 16);
    const gid = await resolveInvite(code);
    if (!gid) return NextResponse.json({ error: "invalid invite" }, { status: 404 });
    const guild = await joinGuild(me, gid);
    return NextResponse.json({ guild, guilds: await listUserGuilds(me) });
  }

  const gid = clean(b.gid, 16);
  if (!gid || !(await isGuildMember(gid, me))) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }

  if (action === "invite") {
    const code = await createInvite(gid);
    return NextResponse.json({ code });
  }
  if (action === "addChannel") {
    const name = clean(b.name, 40)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    await addGuildChannel(gid, name);
    return NextResponse.json({ channels: await getGuildChannels(gid) });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
