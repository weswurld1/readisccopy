/** Trim/clamp a candidate string; returns fallback when empty or not a string. */
export function clean(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, max).trim() || fallback;
}

/** A user handle: trimmed, max 32 chars. Empty => "". Case-sensitive. */
export function handle(value: unknown): string {
  return clean(value, 32);
}
