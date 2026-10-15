import { Redis } from "@upstash/redis";

export type Message = {
  id: string;
  author: string;
  content: string;
  channel: string;
  ts: number;
};

const MAX_PER_CHANNEL = 200;

// Prefer Upstash env vars; also accept Vercel KV's names (KV_REST_API_*).
function makeRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return new Redis({ url, token });
  return null;
}

const redis = makeRedis();

/** True when a shared, durable store is active (survives cold starts / instances). */
export const durable = redis !== null;

// In-memory fallback: per-instance, resets on cold start. Kept on globalThis so
// it survives dev hot-reloads within a single process.
const g = globalThis as unknown as { __relayMem?: Record<string, Message[]> };
const mem = g.__relayMem ?? (g.__relayMem = {});

function key(channel: string): string {
  return `relay:chat:${channel}`;
}

function coerce(entry: unknown): Message | null {
  const m = (typeof entry === "string" ? safeParse(entry) : entry) as
    | Message
    | null;
  if (m && typeof m.ts === "number" && typeof m.content === "string") return m;
  return null;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function addMessage(msg: Message): Promise<void> {
  if (redis) {
    await redis.rpush(key(msg.channel), msg);
    await redis.ltrim(key(msg.channel), -MAX_PER_CHANNEL, -1);
    return;
  }
  const list = mem[msg.channel] ?? (mem[msg.channel] = []);
  list.push(msg);
  if (list.length > MAX_PER_CHANNEL) {
    mem[msg.channel] = list.slice(-MAX_PER_CHANNEL);
  }
}

export async function getMessages(
  channel: string,
  since: number
): Promise<Message[]> {
  if (redis) {
    const raw = await redis.lrange(key(channel), -MAX_PER_CHANNEL, -1);
    return raw
      .map(coerce)
      .filter((m): m is Message => m !== null && m.ts > since);
  }
  const list = mem[channel] ?? [];
  return list.filter((m) => m.ts > since);
}
