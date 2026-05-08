function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function parseUserIds(name: string, requireNonEmpty: boolean): ReadonlySet<number> {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    if (requireNonEmpty) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return new Set();
  }
  const ids = new Set<number>();
  for (const part of raw.split(/[,;\s]+/)) {
    if (!part) continue;
    const n = Number(part);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid user id in ${name}: "${part}"`);
    }
    ids.add(n);
  }
  if (requireNonEmpty && ids.size === 0) {
    throw new Error(`${name} must contain at least one user id`);
  }
  return ids;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  apiRoot: optional("API_ROOT", "https://api.telegram.org"),
  logLevel: optional("LOG_LEVEL", "info"),
  igCookies: optional("IG_COOKIES", ""),
  tiktokCookies: optional("TIKTOK_COOKIES", ""),
  adminUserIds: parseUserIds("ADMIN_USER_IDS", true),
  storagePath: optional("STORAGE_PATH", "data/storage.json"),
} as const;

export type Config = typeof config;
