/** Trim/clamp a candidate string; returns fallback when empty or not a string. */
export function clean(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max).trim() || fallback;
}

/** A user handle: trimmed, max 32 chars. Empty => "". Case-sensitive. */
export function handle(value: unknown): string {
  return clean(value, 32);
}

// Pusher channel names: safe chars only. Server and client must agree.
function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}
export function channelTopic(guild: string, channel: string): string {
  return `ch-${safe(guild || "global")}-${safe(channel)}`.slice(0, 160);
}
export function dmTopic(a: string, b: string): string {
  return `dm-${[safe(a), safe(b)].sort().join("__")}`.slice(0, 160);
}
