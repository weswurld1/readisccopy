import { NextRequest, NextResponse } from "next/server";
import { searchChannel, searchDirect } from "@/app/lib/store";
import { clean, handle } from "@/app/lib/util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = clean(sp.get("q"), 100);
  if (!q) return NextResponse.json({ results: [] });
  const me = handle(sp.get("me"));
  const peer = handle(sp.get("peer"));
  const results = peer
    ? await searchDirect(me, peer, q)
    : await searchChannel(
        clean(sp.get("guild"), 16),
        clean(sp.get("channel"), 40, "general"),
        q
      );
  return NextResponse.json({ results });
}
