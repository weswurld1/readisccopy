import Pusher from "pusher";

let client: Pusher | null = null;

/** Server-side Pusher client, or null when not configured. */
export function pusherServer(): Pusher | null {
  if (client) return client;
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster =
    process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  client = new Pusher({ appId, key, secret, cluster, useTLS: true });
  return client;
}

/** Fire-and-forget event publish; silently no-ops when Pusher isn't set up. */
export async function publish(
  topic: string,
  event: string,
  payload: unknown
): Promise<void> {
  const p = pusherServer();
  if (!p) return;
  try {
    await p.trigger(topic, event, payload);
  } catch {
    // never let a realtime hiccup fail the request
  }
}
