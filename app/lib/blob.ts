// Vercel names the Blob token BLOB_READ_WRITE_TOKEN for the default store, but
// uses a prefixed name (e.g. <STORE>_READ_WRITE_TOKEN) for named stores. Find
// whichever one is present so uploads work regardless of the store's name.
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [k, v] of Object.entries(process.env)) {
    if (v && /BLOB.*READ.*WRITE.*TOKEN/i.test(k)) return v;
  }
  return undefined;
}

/** Names (not values) of env vars that look blob-related — for diagnostics. */
export function blobVarNames(): string[] {
  return Object.keys(process.env).filter((k) => /blob/i.test(k));
}
