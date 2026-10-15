import { Redis } from "@upstash/redis";

export type Message = {
  id: string;
  author: string;
  content: string;
  channel: string;
  ts: number;
  image?: string;
};

export type FriendState = {
  friends: string[];
  incoming: string[];
  outgoing: string[];
};

const MAX_PER_CHANNEL = 200;
const PRESENCE_TTL = 30_000; // online if seen within 30s
const VOICE_TTL = 15_000; // in voice room if pinged within 15s
const PRESENCE_PRUNE = 3_600_000; // drop presence entries older than 1h

// ---------- backend selection ----------

function makeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return new Redis({ url, token });
  return null;
}

const redis = makeRedis();

/** True when a shared, durable store is active (survives cold starts / instances). */
export const durable = redis !== null;

/** Which backing env vars are present (names only, never values). */
export function storeEnv() {
  return {
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
  };
}

/** Live connectivity check against Redis (if configured). */
export async function ping(): Promise<{ ok: boolean; error?: string }> {
  if (!redis) return { ok: false, error: "no redis configured" };
  try {
    await redis.ping();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ping failed" };
  }
}

// ---------- tiny KV abstraction (Redis or in-memory) ----------

interface KV {
  lpushTrim(key: string, value: unknown, max: number): Promise<void>;
  lrange(key: string): Promise<unknown[]>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  shas(key: string, member: string): Promise<boolean>;
  zaddNow(key: string, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  zAbove(key: string, minScore: number): Promise<string[]>;
  zPruneBelow(key: string, maxScore: number): Promise<void>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}

const redisKV: KV = {
  async lpushTrim(key, value, max) {
    await redis!.rpush(key, value as never);
    await redis!.ltrim(key, -max, -1);
  },
  async lrange(key) {
    return redis!.lrange(key, 0, -1);
  },
  async sadd(key, member) {
    await redis!.sadd(key, member);
  },
  async srem(key, member) {
    await redis!.srem(key, member);
  },
  async smembers(key) {
    return (await redis!.smembers(key)) as string[];
  },
  async shas(key, member) {
    return (await redis!.sismember(key, member)) === 1;
  },
  async zaddNow(key, member) {
    await redis!.zadd(key, { score: Date.now(), member });
  },
  async zrem(key, member) {
    await redis!.zrem(key, member);
  },
  async zAbove(key, minScore) {
    return (await redis!.zrange(key, minScore, "+inf", {
      byScore: true,
    })) as string[];
  },
  async zPruneBelow(key, maxScore) {
    await redis!.zremrangebyscore(key, 0, maxScore);
  },
  async hset(key, field, value) {
    await redis!.hset(key, { [field]: value });
  },
  async hgetall(key) {
    return ((await redis!.hgetall(key)) as Record<string, string>) ?? {};
  },
};

type Mem = {
  lists: Record<string, unknown[]>;
  sets: Record<string, Set<string>>;
  zsets: Record<string, Map<string, number>>;
  hashes: Record<string, Record<string, string>>;
};

const g = globalThis as unknown as { __relayMem?: Mem };
const mem: Mem =
  g.__relayMem ??
  (g.__relayMem = { lists: {}, sets: {}, zsets: {}, hashes: {} });
if (!mem.hashes) mem.hashes = {};

const memKV: KV = {
  async lpushTrim(key, value, max) {
    const list = mem.lists[key] ?? (mem.lists[key] = []);
    list.push(value);
    if (list.length > max) mem.lists[key] = list.slice(-max);
  },
  async lrange(key) {
    return mem.lists[key] ?? [];
  },
  async sadd(key, member) {
    (mem.sets[key] ?? (mem.sets[key] = new Set())).add(member);
  },
  async srem(key, member) {
    mem.sets[key]?.delete(member);
  },
  async smembers(key) {
    return Array.from(mem.sets[key] ?? []);
  },
  async shas(key, member) {
    return mem.sets[key]?.has(member) ?? false;
  },
  async zaddNow(key, member) {
    (mem.zsets[key] ?? (mem.zsets[key] = new Map())).set(member, Date.now());
  },
  async zrem(key, member) {
    mem.zsets[key]?.delete(member);
  },
  async zAbove(key, minScore) {
    const z = mem.zsets[key];
    if (!z) return [];
    const out: string[] = [];
    z.forEach((score, member) => {
      if (score >= minScore) out.push(member);
    });
    return out;
  },
  async zPruneBelow(key, maxScore) {
    const z = mem.zsets[key];
    if (!z) return;
    z.forEach((score, member) => {
      if (score <= maxScore) z.delete(member);
    });
  },
  async hset(key, field, value) {
    (mem.hashes[key] ?? (mem.hashes[key] = {}))[field] = value;
  },
  async hgetall(key) {
    return mem.hashes[key] ?? {};
  },
};

const kv: KV = redis ? redisKV : memKV;

// ---------- keys ----------

const K = {
  channel: (c: string) => `relay:chan:${c}`,
  dm: (a: string, b: string) => `relay:dm:${[a, b].sort().join("\u0000")}`,
  users: "relay:users",
  presence: "relay:presence",
  friends: (n: string) => `relay:friends:${n}`,
  reqIn: (n: string) => `relay:req:in:${n}`,
  reqOut: (n: string) => `relay:req:out:${n}`,
  voice: (room: string) => `relay:voice:${room}`,
  avatars: "relay:avatars",
  guild: (id: string) => `relay:guild:${id}`,
  guildMembers: (id: string) => `relay:guild:${id}:members`,
  guildChannels: (id: string) => `relay:guild:${id}:channels`,
  userGuilds: (h: string) => `relay:uguilds:${h}`,
  invite: (code: string) => `relay:invite:${code}`,
  gchan: (id: string, c: string) => `relay:gchan:${id}:${c}`,
  activity: "relay:activity",
};

// ---------- helpers ----------

function coerce(entry: unknown): Message | null {
  let m: unknown = entry;
  if (typeof entry === "string") {
    try {
      m = JSON.parse(entry);
    } catch {
      return null;
    }
  }
  const msg = m as Message;
  if (msg && typeof msg.ts === "number" && typeof msg.content === "string") {
    return msg;
  }
  return null;
}

async function readMessages(key: string, since: number): Promise<Message[]> {
  const raw = await kv.lrange(key);
  return raw
    .map(coerce)
    .filter((m): m is Message => m !== null && m.ts > since)
    .slice(-100);
}

// ---------- public API: messages ----------

export async function addChannelMessage(msg: Message): Promise<void> {
  await kv.lpushTrim(K.channel(msg.channel), msg, MAX_PER_CHANNEL);
}

export function getChannelMessages(channel: string, since: number) {
  return readMessages(K.channel(channel), since);
}

export async function addDirectMessage(
  me: string,
  peer: string,
  msg: Message
): Promise<void> {
  await kv.lpushTrim(K.dm(me, peer), msg, MAX_PER_CHANNEL);
}

export function getDirectMessages(me: string, peer: string, since: number) {
  return readMessages(K.dm(me, peer), since);
}

// ---------- public API: identity & presence ----------

export async function registerUser(name: string): Promise<void> {
  await kv.sadd(K.users, name);
}

export async function heartbeat(name: string): Promise<void> {
  await kv.zaddNow(K.presence, name);
  await kv.zPruneBelow(K.presence, Date.now() - PRESENCE_PRUNE);
}

export function onlineUsers(): Promise<string[]> {
  return kv.zAbove(K.presence, Date.now() - PRESENCE_TTL);
}

// ---------- public API: avatars (handle -> image URL) ----------

export async function setAvatar(handle: string, url: string): Promise<void> {
  if (!handle || !url) return;
  await kv.hset(K.avatars, handle, url);
}

export function getAvatars(): Promise<Record<string, string>> {
  return kv.hgetall(K.avatars);
}

// ---------- public API: activity ("Playing X", desktop-detected) ----------

export async function setActivity(handle: string, game: string): Promise<void> {
  if (!handle) return;
  await kv.hset(K.activity, handle, game || "");
}

export function getActivities(): Promise<Record<string, string>> {
  return kv.hgetall(K.activity);
}

// ---------- public API: friends ----------

export async function getFriendState(name: string): Promise<FriendState> {
  const [friends, incoming, outgoing] = await Promise.all([
    kv.smembers(K.friends(name)),
    kv.smembers(K.reqIn(name)),
    kv.smembers(K.reqOut(name)),
  ]);
  return { friends, incoming, outgoing };
}

export async function requestFriend(from: string, to: string): Promise<void> {
  if (from === to) return;
  if (await kv.shas(K.friends(from), to)) return; // already friends
  // If the target already requested us, treat this as an accept.
  if (await kv.shas(K.reqIn(from), to)) {
    await acceptFriend(from, to);
    return;
  }
  await kv.sadd(K.reqOut(from), to);
  await kv.sadd(K.reqIn(to), from);
}

export async function acceptFriend(
  me: string,
  requester: string
): Promise<void> {
  if (!(await kv.shas(K.reqIn(me), requester))) return;
  await Promise.all([
    kv.sadd(K.friends(me), requester),
    kv.sadd(K.friends(requester), me),
    kv.srem(K.reqIn(me), requester),
    kv.srem(K.reqOut(requester), me),
    // clear any crossed/duplicate request in the other direction
    kv.srem(K.reqOut(me), requester),
    kv.srem(K.reqIn(requester), me),
  ]);
}

export async function declineFriend(
  me: string,
  requester: string
): Promise<void> {
  await Promise.all([
    kv.srem(K.reqIn(me), requester),
    kv.srem(K.reqOut(requester), me),
  ]);
}

export async function removeFriend(me: string, other: string): Promise<void> {
  await Promise.all([
    kv.srem(K.friends(me), other),
    kv.srem(K.friends(other), me),
  ]);
}

// ---------- public API: voice room shell ----------

export async function joinVoice(room: string, name: string): Promise<void> {
  await kv.zaddNow(K.voice(room), name);
  await kv.zPruneBelow(K.voice(room), Date.now() - PRESENCE_PRUNE);
}

export async function leaveVoice(room: string, name: string): Promise<void> {
  await kv.zrem(K.voice(room), name);
}

export function voiceParticipants(room: string): Promise<string[]> {
  return kv.zAbove(K.voice(room), Date.now() - VOICE_TTL);
}

// ---------- public API: guilds (servers) ----------

export type Guild = { id: string; name: string; owner: string };

function randomId(len: number): string {
  let s = "";
  while (s.length < len) s += Math.random().toString(36).slice(2);
  return s.slice(0, len);
}

export async function createGuild(owner: string, name: string): Promise<Guild> {
  const id = randomId(8);
  await Promise.all([
    kv.hset(K.guild(id), "name", name),
    kv.hset(K.guild(id), "owner", owner),
    kv.sadd(K.guildMembers(id), owner),
    kv.sadd(K.guildChannels(id), "general"),
    kv.sadd(K.userGuilds(owner), id),
  ]);
  return { id, name, owner };
}

export async function getGuild(id: string): Promise<Guild | null> {
  const h = await kv.hgetall(K.guild(id));
  if (!h || !h.name) return null;
  return { id, name: h.name, owner: h.owner };
}

export async function listUserGuilds(handle: string): Promise<Guild[]> {
  const ids = await kv.smembers(K.userGuilds(handle));
  const guilds = await Promise.all(ids.map(getGuild));
  return guilds.filter((g): g is Guild => g !== null);
}

export async function getGuildChannels(id: string): Promise<string[]> {
  const ch = await kv.smembers(K.guildChannels(id));
  ch.sort((a, b) =>
    a === "general" ? -1 : b === "general" ? 1 : a.localeCompare(b)
  );
  return ch.length ? ch : ["general"];
}

export async function addGuildChannel(id: string, name: string): Promise<void> {
  await kv.sadd(K.guildChannels(id), name);
}

export function isGuildMember(id: string, handle: string): Promise<boolean> {
  return kv.shas(K.guildMembers(id), handle);
}

export async function createInvite(id: string): Promise<string> {
  const code = randomId(6);
  await kv.hset(K.invite(code), "gid", id);
  return code;
}

export async function resolveInvite(code: string): Promise<string | null> {
  const h = await kv.hgetall(K.invite(code));
  return h?.gid || null;
}

export async function joinGuild(handle: string, id: string): Promise<Guild | null> {
  const g = await getGuild(id);
  if (!g) return null;
  await Promise.all([
    kv.sadd(K.guildMembers(id), handle),
    kv.sadd(K.userGuilds(handle), id),
  ]);
  return g;
}

export async function addGuildMessage(
  id: string,
  channel: string,
  msg: Message
): Promise<void> {
  await kv.lpushTrim(K.gchan(id, channel), msg, MAX_PER_CHANNEL);
}

export function getGuildMessages(id: string, channel: string, since: number) {
  return readMessages(K.gchan(id, channel), since);
}
