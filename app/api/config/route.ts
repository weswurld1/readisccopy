import { NextResponse } from "next/server";

// Public, client-safe runtime config. The Pusher key + cluster are not secrets
// (only the app secret is), so we can serve them without requiring the client
// to have NEXT_PUBLIC_* build-time vars.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY;
  const cluster =
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER || process.env.PUSHER_CLUSTER;
  const hasSecret = !!process.env.PUSHER_SECRET;
  return NextResponse.json({
    pusher: key && cluster && hasSecret ? { key, cluster } : null,
  });
}
